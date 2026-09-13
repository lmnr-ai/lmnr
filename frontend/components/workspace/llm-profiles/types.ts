import {
  type AzureProvider,
  isAzureProvider,
  isOpenAIProvider,
  type LlmProfile,
  type LlmProfileConfig,
  type LlmProfileProvider,
  type LlmProfileSecrets,
  type OpenAIProvider,
  type SecretKey,
} from "@/lib/actions/llm-profiles/schema";

/** Provider select entries; the OpenAI and Azure API shapes each collapse into one entry with a sub-select. */
export type UiProvider = Exclude<LlmProfileProvider, OpenAIProvider | AzureProvider> | "openai" | "azure";

export const UI_PROVIDER_OPTIONS: Array<{ value: UiProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "groq", label: "Groq" },
  { value: "mistral", label: "Mistral" },
  { value: "bedrock", label: "AWS Bedrock" },
  { value: "azure", label: "Azure AI Foundry" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

export const OPENAI_SHAPE_OPTIONS: Array<{ value: OpenAIProvider; label: string }> = [
  { value: "openai_completions", label: "Chat Completions" },
  { value: "openai_responses", label: "Responses API" },
];

export const AZURE_SHAPE_OPTIONS: Array<{ value: AzureProvider; label: string }> = [
  { value: "azure_chat_completions", label: "Chat Completions" },
  { value: "azure_responses", label: "Responses API" },
  { value: "azure_anthropic", label: "Anthropic Messages" },
];

export type LlmProfileFormValues = {
  name: string;
  uiProvider: UiProvider;
  openaiShape: OpenAIProvider;
  azureShape: AzureProvider;
  azureEndpoint: "resourceId" | "baseUrl";
  bedrockAuth: "aws_keys" | "bearer_token";
  region: string;
  accessKeyId: string;
  resourceId: string;
  baseUrl: string;
  apiVersion: string;
  headers: Array<{ name: string; value: string }>;
  apiKey: string;
  secretAccessKey: string;
  token: string;
  models: string[];
};

export type LlmProfileRequestBody = {
  name: string;
  profile: LlmProfileConfig;
  secrets: LlmProfileSecrets;
  models: string[];
};

export const toProvider = (values: LlmProfileFormValues): LlmProfileProvider => {
  switch (values.uiProvider) {
    case "openai":
      return values.openaiShape;
    case "azure":
      return values.azureShape;
    default:
      return values.uiProvider;
  }
};

/** The form entry a wire provider belongs to; API shapes within a family share credentials. */
export const toUiProvider = (provider: LlmProfileProvider): UiProvider => {
  if (isOpenAIProvider(provider)) return "openai";
  if (isAzureProvider(provider)) return "azure";
  return provider;
};

/** Stored secrets can be kept when only the API shape changed, since the key is per family. */
export const sameProviderFamily = (values: LlmProfileFormValues, existing?: LlmProfile | null): boolean =>
  !!existing && toUiProvider(existing.provider) === values.uiProvider;

/** Secret fields that must be filled: on create always, on edit only when the stored value is absent. */
export const missingRequiredSecrets = (values: LlmProfileFormValues, existing?: LlmProfile | null): string[] => {
  const present = existing?.secrets;
  const sameProvider = sameProviderFamily(values, existing);
  const missing: string[] = [];
  const need = (field: SecretKey, label: string) => {
    if (!values[field] && !(sameProvider && present?.[field])) missing.push(label);
  };
  if (values.uiProvider === "bedrock") {
    if (values.bedrockAuth === "aws_keys") need("secretAccessKey", "Secret access key");
    else need("token", "Bearer token");
  } else {
    need("apiKey", "API key");
  }
  if (values.uiProvider === "custom") {
    for (const header of values.headers) {
      const name = header.name.trim();
      if (name && !header.value && !(sameProvider && present?.headers.includes(name))) {
        missing.push(`Header "${name}"`);
      }
    }
  }
  return missing;
};
