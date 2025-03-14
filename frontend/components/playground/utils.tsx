import { ReactNode } from "react";

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
import { Provider } from "@/lib/pipeline/types";

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
