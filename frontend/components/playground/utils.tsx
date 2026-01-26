import { jsonSchema, tool } from "ai";
import { get, pickBy } from "lodash";
import { type ReactNode } from "react";

import { type Provider, providers } from "@/components/playground/types";
import {
  IconAmazonBedrock,
  IconAnthropic,
  IconAzure,
  IconGemini,
  IconGoogle,
  IconGroq,
  IconMistral,
  IconOpenAI,
} from "@/components/ui/icons";
import { EnvVars } from "@/lib/env/utils";
import { anthropicThinkingModels } from "@/lib/playground/providers/anthropic";
import { googleProviderOptionsSettings, googleThinkingModels } from "@/lib/playground/providers/google";
import { openAIThinkingModels } from "@/lib/playground/providers/openai";
import { type ProviderOptions } from "@/lib/playground/types";
import { type Span } from "@/lib/traces/types";

export const providerIconMap: Record<Provider, ReactNode> = {
  openai: <IconOpenAI />,
  anthropic: <IconAnthropic />,
  gemini: <IconGemini />,
  groq: <IconGroq />,
  mistral: <IconMistral />,
  bedrock: <IconAmazonBedrock />,
  "openai-azure": <IconAzure />,
};

export const providerNameMap: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  bedrock: "Amazon Bedrock",
  "openai-azure": "Azure",
};

export const envVarsToIconMap: Record<EnvVars, ReactNode> = {
  [EnvVars.OPENAI_API_KEY]: <IconOpenAI />,
  [EnvVars.GEMINI_API_KEY]: <IconGemini />,
  [EnvVars.GROQ_API_KEY]: <IconGroq />,
  [EnvVars.ANTHROPIC_API_KEY]: <IconAnthropic />,
  [EnvVars.MISTRAL_API_KEY]: <IconMistral />,
  [EnvVars.OPENAI_AZURE_API_KEY]: <IconAzure />,
  [EnvVars.OPENAI_AZUURE_DEPLOYMENT_NAME]: <IconAzure />,
  [EnvVars.OPENAI_AZUURE_RESOURCE_ID]: <IconAzure />,
  [EnvVars.AWS_REGION]: <IconAmazonBedrock />,
  [EnvVars.AWS_ACCESS_KEY_ID]: <IconAmazonBedrock />,
  [EnvVars.AWS_SECRET_ACCESS_KEY]: <IconAmazonBedrock />,
  [EnvVars.GOOGLE_SEARCH_ENGINE_ID]: <IconGoogle />,
  [EnvVars.GOOGLE_SEARCH_API_KEY]: <IconGoogle />,
};

export const defaultMaxTokens = 1024;
export const defaultTemperature = 1;

export const getDefaultThinkingModelProviderOptions = <P extends Provider, K extends string>(
  value: `${P}:${K}`
): ProviderOptions => {
  const [provider] = value.split(":") as [P, K];
  if (
    [...anthropicThinkingModels, ...googleThinkingModels, ...openAIThinkingModels].find((m) => m === (value as string))
  ) {
    switch (provider) {
      case "anthropic":
        return {
          anthropic: {
            thinking: {
              type: "disabled",
              budgetTokens: 1024,
            },
          },
        };
      case "gemini": {
        const config = googleProviderOptionsSettings[value as (typeof googleThinkingModels)[number]].thinkingConfig;
        return {
          google: {
            thinkingConfig: {
              includeThoughts: false,
              thinkingBudget: config?.min,
            },
          },
        };
      }
      case "openai":
        return {
          openai: {
            reasoningEffort: "low",
          },
        };
      default:
        return {};
    }
  }
  return {};
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
  tools?: { name: string; type: string; description?: string; parameters: Record<string, any> }[]
) =>
  tools
    ? JSON.stringify(
      tools.reduce(
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


const parseGenAiToolsDefinitionsFromSpan = (
  tools?: string
) => {
  try {
    if (!tools) {
      return undefined;
    }
    const parsedTools = JSON.parse(tools) as { type: "function"; name?: string; function: { name: string; description?: string; parameters: Record<string, any> } }[];
    return JSON.stringify(parsedTools.reduce(
      (acc, tool) => {
        const func = tool.function ?? tool;
        return {
          ...acc,
          [func.name]: {
            description: func.description || "",
            parameters: func.parameters,
          },
        };
      },
      {}
    ));
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

    // Use whichever one is available
    const paramsToParse = parametersStr || argumentsStr;

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
  span: Span
): {
  tools?: string;
  toolChoice?: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  outputSchema?: string;
} => {
  const model = get(span, ["attributes", "gen_ai.response.model"]) as string | undefined;

  const existingModels = providers.flatMap((p) => p.models).map((p) => p.name);
  const models = providers.flatMap((p) => p.models);

  // TODO: unify this logic with the one in StatsShields
  const aiSdkTools = get(span, ["attributes", "ai.prompt.tools"]);
  const genAiTools = get(span, ["attributes", "gen_ai.tool.definitions"]);
  const parsedTools = aiSdkTools ? parseAiSdkToolsFromSpan(aiSdkTools) : (
    genAiTools ? parseGenAiToolsDefinitionsFromSpan(genAiTools) : parseToolsFromLLMRequest(span)
  );

  const toolChoice = get(span, ["attributes", "ai.prompt.toolChoice"]);
  const parsedToolChoice = parseToolChoiceFromSpan(toolChoice);

  const outputSchema = get(span, ["attributes", "gen_ai.request.structured_output_schema"]) as string | undefined;

  const referenceModel =
    model &&
    (existingModels.find((existingModel) => model === existingModel) ||
      existingModels.filter((existingModel) => model.includes(existingModel)).sort((a, b) => b.length - a.length)[0]);
  const foundModel = models.find((m) => m.name === referenceModel)?.id;

  const result = {
    modelId: foundModel ? foundModel : "openai:gpt-4o-mini",
    tools: parsedTools,
    toolChoice: parsedToolChoice || (parsedTools ? "auto" : undefined),
    maxTokens: get(span, ["attributes", "gen_ai.request.max_tokens"], defaultMaxTokens),
    temperature: get(span, ["attributes", "gen_ai.request.temperature"], defaultTemperature),
    outputSchema,
  };

  return pickBy(result, (value) => value !== undefined) as typeof result;
};
