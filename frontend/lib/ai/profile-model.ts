import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { defaultSettingsMiddleware, type LanguageModel, wrapLanguageModel } from "ai";

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
  model: string,
  options: { fetch?: typeof globalThis.fetch } = {}
): LanguageModel {
  const apiKey = () => requireSecret(secrets.apiKey, "API key");
  const fetchOpt = options.fetch ? { fetch: options.fetch } : {};

  switch (profile.provider) {
    case "openai_completions":
      return createOpenAI({ apiKey: apiKey(), ...fetchOpt }).chat(model);
    case "openai_responses":
      return createOpenAI({ apiKey: apiKey(), ...fetchOpt }).responses(model);
    case "anthropic":
      return createAnthropic({ apiKey: apiKey(), ...fetchOpt })(model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: apiKey(), ...fetchOpt })(model);
    case "groq":
      return createGroq({ apiKey: apiKey(), ...fetchOpt })(model);
    case "mistral":
      return createMistral({ apiKey: apiKey(), ...fetchOpt })(model);
    case "bedrock": {
      const { region, auth } = profile.config;
      const bedrock =
        auth.type === "aws_keys"
          ? createAmazonBedrock({
              region,
              accessKeyId: auth.accessKeyId,
              secretAccessKey: requireSecret(secrets.secretAccessKey, "AWS secret access key"),
              ...fetchOpt,
            })
          : createAmazonBedrock({ region, apiKey: requireSecret(secrets.token, "Bedrock bearer token"), ...fetchOpt });
      return bedrock(model);
    }
    case "azure_anthropic":
      return createAnthropic({
        apiKey: apiKey(),
        baseURL: azureAnthropicBaseUrl(azureEndpoint(profile.config)),
        ...fetchOpt,
      })(model);
    case "azure_chat_completions":
    case "azure_responses": {
      const baseURL = azureOpenAIBaseUrl(azureEndpoint(profile.config));
      const apiVersion = profile.config.apiVersion?.trim() || undefined;
      const azure = createAzure({
        apiKey: apiKey(),
        baseURL,
        ...(apiVersion ? { apiVersion } : {}),
        ...(apiVersion && !isAzureOpenAIHost(baseURL)
          ? { fetch: appendApiVersion(apiVersion, options.fetch) }
          : fetchOpt),
      });
      return profile.provider === "azure_responses" ? azure(model) : azure.chat(model);
    }
    case "custom":
    case "custom_responses": {
      const headers: Record<string, string> = {};
      for (const name of profile.config.headerNames) {
        headers[name] = requireSecret(secrets.headers?.[name], `value for header "${name}"`);
      }
      const gateway = createOpenAI({ apiKey: apiKey(), baseURL: profile.config.baseUrl, headers, ...fetchOpt });
      if (profile.provider === "custom") return gateway.chat(model);
      // Gateways rarely persist responses, so multi-step calls must resend prior items, not `item_reference` ids.
      return wrapLanguageModel({
        model: gateway.responses(model),
        middleware: defaultSettingsMiddleware({ settings: { providerOptions: { openai: { store: false } } } }),
      });
    }
  }
}

function azureEndpoint(config: { resourceId?: string; baseUrl?: string }): string {
  if (config.baseUrl) return config.baseUrl;
  if (config.resourceId) return `https://${config.resourceId}.services.ai.azure.com`;
  throw new Error("LLM profile is missing its Azure resource id or base URL");
}
