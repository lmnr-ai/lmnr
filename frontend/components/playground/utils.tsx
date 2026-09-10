import { jsonSchema, tool } from "ai";
import { get, pickBy } from "lodash";

import { type LlmProfileOption } from "@/lib/actions/llm-profiles";
import { type LlmProfileProvider } from "@/lib/actions/llm-profiles/schema";
import { matchKnownModel, thinkingNamespace } from "@/lib/playground/providers";
import { anthropicProviderOptionsSettings, anthropicThinkingModels } from "@/lib/playground/providers/anthropic";
import { googleProviderOptionsSettings, googleThinkingModels } from "@/lib/playground/providers/google";
import { openAIThinkingModels } from "@/lib/playground/providers/openai";
import { type ProviderOptions } from "@/lib/playground/types";
import { type Span } from "@/lib/traces/types";

export const defaultMaxTokens = 1024;
export const defaultTemperature = 1;

export const getDefaultThinkingModelProviderOptions = (
  provider: LlmProfileProvider | undefined,
  model: string
): ProviderOptions => {
  switch (thinkingNamespace(provider)) {
    case "anthropic": {
      const known = matchKnownModel(anthropicThinkingModels, model);
      if (!known) return {};
      if (anthropicProviderOptionsSettings[known].thinking.type === "effort") {
        return { anthropic: { thinking: { type: "adaptive" }, effort: "medium" } };
      }
      return { anthropic: { thinking: { type: "disabled" } } };
    }
    case "google": {
      const known = matchKnownModel(googleThinkingModels, model);
      if (!known) return {};
      const config = googleProviderOptionsSettings[known].thinkingConfig;
      if (config.type === "level") {
        const defaultLevel = config.levels.includes("medium") ? "medium" : config.levels[0];
        return { google: { thinkingConfig: { includeThoughts: false, thinkingLevel: defaultLevel } } };
      }
      return { google: { thinkingConfig: { includeThoughts: false, thinkingBudget: config.min } } };
    }
    case "openai":
      return matchKnownModel(openAIThinkingModels, model) ? { openai: { reasoningEffort: "low" } } : {};
    default:
      return {};
  }
};

export type LlmRoute = { llmProfileId: string; llmModel: string };

/**
 * Profile/model pair to open a span in the playground on: the first profile
 * listing the span's model verbatim (case-insensitive). Anything looser risks
 * binding to a model the user did not choose, so otherwise they pick.
 */
export const pickLlmRoute = (profiles: LlmProfileOption[], model: string | undefined): LlmRoute | null => {
  const needle = model?.trim().toLowerCase();
  if (!needle) return null;
  for (const profile of profiles) {
    const listed = profile.models.find((m) => m.toLowerCase() === needle);
    if (listed) return { llmProfileId: profile.id, llmModel: listed };
  }
  return null;
};

export const parseTools = (tools?: string) => {
  if (!tools) {
    return {};
  }

  const parsed = JSON.parse(tools) as Record<string, { description?: string; parameters: object }>;

  return Object.entries(parsed).reduce(
    (acc, [toolName, toolItem]) => {
      acc[toolName] = tool({
        ...toolItem,
        inputSchema: jsonSchema(toolItem.parameters),
      });
      return acc;
    },
    {} as Record<string, any>
  );
};

const parseAiSdkToolsFromSpan = (
  tools?: {
    name: string;
    type: string;
    description?: string;
    parameters?: Record<string, any>;
    inputSchema?: Record<string, any>;
  }[]
) =>
  tools
    ? JSON.stringify(
        tools.reduce(
          (acc, tool) => ({
            ...acc,
            [tool.name]: {
              description: tool.description || "",
              parameters: tool.parameters || tool.inputSchema,
            },
          }),
          {}
        )
      )
    : undefined;

const parseGenAiToolsDefinitionsFromSpan = (tools?: string) => {
  try {
    if (!tools) {
      return undefined;
    }
    const parsedTools = (typeof tools === "string" ? JSON.parse(tools) : tools) as {
      type: "function";
      name?: string;
      function: { name: string; description?: string; parameters: Record<string, any> };
    }[];
    return JSON.stringify(
      parsedTools.reduce((acc, tool) => {
        const func = tool.function ?? tool;
        return {
          ...acc,
          [func.name]: {
            description: func.description || "",
            parameters: func.parameters,
          },
        };
      }, {})
    );
  } catch (e) {
    console.error(`Failed to parse gen_ai.tool.definitions:`, e);
    return undefined;
  }
};

export const parseToolChoiceFromSpan = (toolChoice?: string) => {
  if (!toolChoice) {
    return undefined;
  }

  try {
    const parsedToolChoice = JSON.parse(toolChoice) as
      | { type: "auto" | "none" | "required" }
      | { type: "function"; function: { name: string } };
    if ("function" in parsedToolChoice) {
      return JSON.stringify({ type: "tool", toolName: parsedToolChoice.function.name });
    }

    return JSON.stringify(parsedToolChoice.type);
  } catch (e) {
    return undefined;
  }
};

export const parseToolsFromLLMRequest = (span: Span) => {
  const functions: { name: string; description?: string; parameters: Record<string, any> }[] = [];
  let index = 0;

  // Keep checking for functions until we don't find one
  while (true) {
    const name = get(span, ["attributes", `llm.request.functions.${index}.name`]) as string | undefined;
    if (!name) break;

    const description = get(span, ["attributes", `llm.request.functions.${index}.description`]) as string | undefined;

    // Try to get parameters from both possible locations
    const parametersStr = get(span, ["attributes", `llm.request.functions.${index}.parameters`]) as string | undefined;
    const argumentsStr = get(span, ["attributes", `llm.request.functions.${index}.arguments`]) as string | undefined;
    const inputSchemaStr = get(span, ["attributes", `llm.request.functions.${index}.input_schema`]) as
      | string
      | undefined;

    // Use whichever one is available
    const paramsToParse = parametersStr || argumentsStr || inputSchemaStr;

    if (paramsToParse) {
      try {
        const parameters = JSON.parse(paramsToParse);
        if (parameters && typeof parameters === "object" && !("additionalProperties" in parameters)) {
          parameters.additionalProperties = false;
        }
        functions.push({
          name,
          description,
          parameters,
        });
      } catch (e) {
        console.error(`Failed to parse parameters for function ${name}:`, e);
      }
    }

    index++;
  }

  // If we found any functions, format them the same way as parseToolsFromSpan
  return functions.length > 0
    ? JSON.stringify(
        functions.reduce(
          (acc, tool) => ({
            ...acc,
            [tool.name]: {
              description: tool.description || "",
              parameters: tool.parameters,
            },
          }),
          {}
        )
      )
    : undefined;
};

export const getPlaygroundConfig = (
  span: Span,
  profiles: LlmProfileOption[]
): {
  tools?: string;
  toolChoice?: string;
  llmProfileId: string | null;
  llmModel: string | null;
  maxTokens?: number;
  temperature?: number;
  outputSchema?: string;
} => {
  const model = (get(span, ["attributes", "gen_ai.response.model"]) ??
    get(span, ["attributes", "gen_ai.request.model"])) as string | undefined;

  // TODO: unify this logic with the one in StatsShields
  const aiSdkTools = get(span, ["attributes", "ai.prompt.tools"]);
  const genAiTools = get(span, ["attributes", "gen_ai.tool.definitions"]);
  const parsedTools = aiSdkTools
    ? parseAiSdkToolsFromSpan(aiSdkTools)
    : genAiTools
      ? parseGenAiToolsDefinitionsFromSpan(genAiTools)
      : parseToolsFromLLMRequest(span);

  const toolChoice = get(span, ["attributes", "ai.prompt.toolChoice"]);
  const parsedToolChoice = parseToolChoiceFromSpan(toolChoice);

  const outputSchema = get(span, ["attributes", "gen_ai.request.structured_output_schema"]) as string | undefined;

  const route = pickLlmRoute(profiles, model);

  const result = {
    llmProfileId: route?.llmProfileId ?? null,
    llmModel: route?.llmModel ?? null,
    tools: parsedTools,
    toolChoice: parsedToolChoice || (parsedTools ? "auto" : undefined),
    maxTokens: get(span, ["attributes", "gen_ai.request.max_tokens"], defaultMaxTokens),
    temperature: get(span, ["attributes", "gen_ai.request.temperature"], defaultTemperature),
    outputSchema,
  };

  return pickBy(result, (value) => value !== undefined) as typeof result;
};
