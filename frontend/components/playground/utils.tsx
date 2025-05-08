import { jsonSchema, tool } from "ai";
import { ReactNode } from "react";

import { Provider } from "@/components/playground/types";
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
): string =>
  JSON.stringify(
    tools
      ? tools.reduce(
          (acc, tool) => ({
            ...acc,
            [tool.name]: {
              description: tool.description || "",
              parameters: tool.parameters,
            },
          }),
          {}
        )
      : ""
  );
