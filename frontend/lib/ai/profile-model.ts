import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { type LlmProfileConfig, type LlmProfileSecrets } from "@/lib/actions/llm-profiles/schema";

import { appendApiVersion, azureAnthropicBaseUrl, azureOpenAIBaseUrl, isAzureOpenAIHost } from "./model";

const requireSecret = (value: string | undefined, label: string): string => {
  if (!value) throw new Error(`LLM profile is missing its ${label}`);
  return value;
};

/** Mirrors `app-server/src/llm/profiles/build.rs`: same endpoints and auth per provider, on the AI SDK. */
export function languageModelFromProfile(
  profile: LlmProfileConfig,
  secrets: LlmProfileSecrets,
  model: string
): LanguageModel {
  const apiKey = () => requireSecret(secrets.apiKey, "API key");

  switch (profile.provider) {
    case "openai_completions":
      return createOpenAI({ apiKey: apiKey() }).chat(model);
    case "openai_responses":
      return createOpenAI({ apiKey: apiKey() }).responses(model);
    case "anthropic":
      return createAnthropic({ apiKey: apiKey() })(model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: apiKey() })(model);
    case "groq":
      return createGroq({ apiKey: apiKey() })(model);
    case "mistral":
      return createMistral({ apiKey: apiKey() })(model);
    case "bedrock": {
      const { region, auth } = profile.config;
      const bedrock =
        auth.type === "aws_keys"
          ? createAmazonBedrock({
              region,
              accessKeyId: auth.accessKeyId,
              secretAccessKey: requireSecret(secrets.secretAccessKey, "AWS secret access key"),
            })
          : createAmazonBedrock({ region, apiKey: requireSecret(secrets.token, "Bedrock bearer token") });
      return bedrock(model);
    }
    case "azure_anthropic":
      return createAnthropic({ apiKey: apiKey(), baseURL: azureAnthropicBaseUrl(azureEndpoint(profile.config)) })(
        model
      );
    case "azure_chat_completions":
    case "azure_responses": {
      const baseURL = azureOpenAIBaseUrl(azureEndpoint(profile.config));
      const apiVersion = profile.config.apiVersion?.trim() || undefined;
      const azure = createAzure({
        apiKey: apiKey(),
        baseURL,
        ...(apiVersion ? { apiVersion } : {}),
        ...(apiVersion && !isAzureOpenAIHost(baseURL) ? { fetch: appendApiVersion(apiVersion) } : {}),
      });
      return profile.provider === "azure_responses" ? azure(model) : azure.chat(model);
    }
    case "custom": {
      const headers: Record<string, string> = {};
      for (const name of profile.config.headerNames) {
        headers[name] = requireSecret(secrets.headers?.[name], `value for header "${name}"`);
      }
      return createOpenAI({ apiKey: apiKey(), baseURL: profile.config.baseUrl, headers }).chat(model);
    }
  }
}

function azureEndpoint(config: { resourceId?: string; baseUrl?: string }): string {
  if (config.baseUrl) return config.baseUrl;
  if (config.resourceId) return `https://${config.resourceId}.services.ai.azure.com`;
  throw new Error("LLM profile is missing its Azure resource id or base URL");
}
