import { isAzureProvider, type LlmProfile, type LlmProfileConfig } from "@/lib/actions/llm-profiles/schema";

import { type LlmProfileFormValues, type LlmProfileRequestBody, toProvider } from "./types";

export const EMPTY_VALUES: LlmProfileFormValues = {
  name: "",
  uiProvider: "openai",
  openaiShape: "openai_completions",
  azureShape: "azure_chat_completions",
  azureEndpoint: "resourceId",
  bedrockAuth: "aws_keys",
  region: "us-east-1",
  accessKeyId: "",
  resourceId: "",
  baseUrl: "",
  apiVersion: "",
  headers: [],
  apiKey: "",
  secretAccessKey: "",
  token: "",
  models: [],
};

/** Secret inputs start empty on edit; an empty field means "keep the stored value". */
export function buildDefaultValues(profile?: LlmProfile | null): LlmProfileFormValues {
  if (!profile) return EMPTY_VALUES;

  const values: LlmProfileFormValues = { ...EMPTY_VALUES, name: profile.name, models: profile.models };

  switch (profile.provider) {
    case "openai_completions":
    case "openai_responses":
      values.uiProvider = "openai";
      values.openaiShape = profile.provider;
      break;
    case "bedrock":
      values.uiProvider = "bedrock";
      values.region = profile.config.region;
      values.bedrockAuth = profile.config.auth.type;
      if (profile.config.auth.type === "aws_keys") values.accessKeyId = profile.config.auth.accessKeyId;
      break;
    case "azure_chat_completions":
    case "azure_responses":
    case "azure_anthropic":
      values.uiProvider = "azure";
      values.azureShape = profile.provider;
      values.azureEndpoint = profile.config.baseUrl ? "baseUrl" : "resourceId";
      values.resourceId = profile.config.resourceId ?? "";
      values.baseUrl = profile.config.baseUrl ?? "";
      values.apiVersion = profile.config.apiVersion ?? "";
      break;
    case "custom":
      values.uiProvider = "custom";
      values.baseUrl = profile.config.baseUrl;
      values.headers = profile.config.headerNames.map((name) => ({ name, value: "" }));
      break;
    default:
      values.uiProvider = profile.provider;
  }
  return values;
}

function buildConfig(values: LlmProfileFormValues): LlmProfileConfig {
  const provider = toProvider(values);
  const apiKeyAuth = { auth: { type: "api_key" as const } };

  if (provider === "bedrock") {
    return {
      provider,
      config: {
        region: values.region,
        auth:
          values.bedrockAuth === "aws_keys"
            ? { type: "aws_keys", accessKeyId: values.accessKeyId }
            : { type: "bearer_token" },
      },
    };
  }
  if (isAzureProvider(provider)) {
    return {
      provider,
      config: {
        ...apiKeyAuth,
        resourceId: values.azureEndpoint === "resourceId" ? values.resourceId : undefined,
        baseUrl: values.azureEndpoint === "baseUrl" ? values.baseUrl : undefined,
        apiVersion: values.apiVersion || undefined,
      },
    };
  }
  if (provider === "custom") {
    return {
      provider,
      config: {
        ...apiKeyAuth,
        baseUrl: values.baseUrl,
        headerNames: values.headers.map((h) => h.name.trim()).filter(Boolean),
      },
    };
  }
  return { provider, config: apiKeyAuth };
}

/** Only filled-in secrets travel; omitted ones keep their stored value server-side. */
export function buildRequestBody(values: LlmProfileFormValues): LlmProfileRequestBody {
  const secrets: LlmProfileRequestBody["secrets"] = {};
  if (values.apiKey) secrets.apiKey = values.apiKey;
  if (values.secretAccessKey) secrets.secretAccessKey = values.secretAccessKey;
  if (values.token) secrets.token = values.token;
  if (values.uiProvider === "custom") {
    const headers: Record<string, string> = {};
    for (const header of values.headers) {
      const name = header.name.trim();
      if (name && header.value) headers[name] = header.value;
    }
    if (Object.keys(headers).length > 0) secrets.headers = headers;
  }
  return {
    name: values.name.trim(),
    profile: buildConfig(values),
    secrets,
    models: values.models,
  };
}
