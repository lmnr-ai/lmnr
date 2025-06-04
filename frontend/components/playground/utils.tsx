import { jsonSchema, tool } from "ai";
import { get, pickBy } from "lodash";
import { ReactNode } from "react";

import { Provider, providers } from "@/components/playground/types";
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
import {
  anthropicThinkingModels,
  googleThinkingModels,
  openAIThinkingModels,
  ProviderOptions,
} from "@/lib/playground/types";
import { Span } from "@/lib/traces/types";

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

export const getDefaultThinkingModelProviderOptions = <P extends Provider, K extends string>(
  value: `${P}:${K}`
): ProviderOptions => {
  const [provider] = value.split(":") as [P, K];
  if ([...anthropicThinkingModels, ...googleThinkingModels, ...openAIThinkingModels].includes(value)) {
    switch (provider) {
      case "anthropic":
        return {
          anthropic: {
            thinking: {
              type: "enabled",
              budgetTokens: 1024,
            },
          },
        };
      case "gemini":
        return {
          google: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 1024,
            },
          },
        };
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
        parameters: jsonSchema(toolItem.parameters),
      });
      return acc;
    },
    {} as Record<string, any>
  );
};

export const parseToolsFromSpan = (
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
} => {
  const model = get(span, ["attributes", "gen_ai.response.model"]) as string | undefined;

  const existingModels = providers.flatMap((p) => p.models).map((p) => p.name);
  const models = providers.flatMap((p) => p.models);

  const tools = get(span, ["attributes", "ai.prompt.tools"]);
  const parsedTools = tools ? parseToolsFromSpan(tools) : parseToolsFromLLMRequest(span);

  const toolChoice = get(span, ["attributes", "ai.prompt.toolChoice"]);
  const parsedToolChoice = parseToolChoiceFromSpan(toolChoice);

  const referenceModel = model && existingModels.find((existingModel) => model.includes(existingModel));
  const foundModel = models.find((m) => m.name === referenceModel)?.id;

  const result = {
    modelId: foundModel ? foundModel : "openai:gpt-4o-mini",
    tools: parsedTools,
    toolChoice: parsedToolChoice || (parsedTools ? "auto" : undefined),
    maxTokens: get(span, ["attributes", "gen_ai.request.max_tokens"]) as number | undefined,
    temperature: get(span, ["attributes", "gen_ai.request.temperature"]) as number | undefined,
  };

  return pickBy(result, (value) => value !== undefined) as typeof result;
};
