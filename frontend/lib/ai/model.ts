import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Model tiers used across AI features (chat with trace, SQL generation, name generation).
 * Each tier maps to a specific model per provider.
 */
type ModelTier = "small" | "medium" | "large";

type LLMProvider = "openai" | "gemini" | "bedrock" | "azure" | "foundry";
type LlmDefaultHeaders = Record<string, string>;

// Per-provider defaults. Used when LLM_MODEL_<TIER> is not set.
const DEFAULT_MODELS: Record<LLMProvider, Record<ModelTier, string>> = {
  gemini: {
    small: "gemini-3.1-flash-lite",
    medium: "gemini-3-flash-preview",
    large: "gemini-3.1-pro-preview",
  },
  bedrock: {
    small: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    medium: "us.anthropic.claude-sonnet-4-6",
    large: "us.anthropic.claude-opus-4-7",
  },
  openai: {
    small: "gpt-5.4-mini",
    medium: "gpt-5.4",
    large: "gpt-5.5",
  },
  // Azure and Foundry model ids are deployment names — these only hold when
  // deployments are named after the model; otherwise set LLM_MODEL_<TIER>.
  azure: {
    small: "gpt-5.4-mini",
    medium: "gpt-5.4",
    large: "gpt-5.5",
  },
  foundry: {
    small: "claude-haiku-4-5",
    medium: "claude-sonnet-5",
    large: "claude-opus-5",
  },
};

function hasBedrockCreds(): boolean {
  return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_REGION;
}

// Blank values must read as unset — k8s ConfigMaps materialize absent keys as "".
const nonEmptyEnv = (name: string): string | undefined => process.env[name]?.trim() || undefined;

function hasAzureCreds(): boolean {
  return (
    !!process.env.LLM_API_KEY && !!(nonEmptyEnv("AZURE_OPENAI_RESOURCE_ID") || nonEmptyEnv("AZURE_OPENAI_BASE_URL"))
  );
}

function hasFoundryCreds(): boolean {
  return !!process.env.LLM_API_KEY && !!(nonEmptyEnv("FOUNDRY_RESOURCE_ID") || nonEmptyEnv("FOUNDRY_BASE_URL"));
}

function getConfiguredLLMProvider(): LLMProvider | null {
  const provider = process.env.LLM_PROVIDER;
  if (provider === "bedrock") {
    return hasBedrockCreds() ? "bedrock" : null;
  }
  // The Responses API is a backend-only path, so the UI features talk Chat
  // Completions to the same endpoint either way.
  if (provider === "azure" || provider === "azure_responses") {
    return hasAzureCreds() ? "azure" : null;
  }
  if (provider === "foundry") {
    return hasFoundryCreds() ? "foundry" : null;
  }
  if (provider === "openai" || provider === "openai_responses") {
    return process.env.LLM_API_KEY ? "openai" : null;
  }
  if (provider === "gemini") {
    return process.env.LLM_API_KEY ? provider : null;
  }
  return null;
}

const isAzureHost = (url: string): boolean => URL.parse(url)?.hostname.endsWith(".openai.azure.com") ?? false;

/**
 * Base URL for `createAzure`, which appends `/v1` itself only for
 * `*.openai.azure.com` hosts. Accepts the portal endpoint, the `/openai` root or
 * a full `/openai/v1` URL, matching the app-server's normalization.
 */
export function azureBaseUrl(rawBaseUrl: string): string {
  const root = rawBaseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/openai(\/v1)?$/, "");
  if (!URL.parse(root)) {
    throw new Error(`Invalid AZURE_OPENAI_BASE_URL: '${rawBaseUrl}' is not an absolute URL`);
  }
  return isAzureHost(root) ? `${root}/openai` : `${root}/openai/v1`;
}

/**
 * Base URL for `createAnthropic`, which appends `/messages`. Accepts the portal
 * endpoint, the `/anthropic` root, or a full `/anthropic/v1` URL.
 */
export function foundryBaseUrl(rawBaseUrl: string): string {
  const root = rawBaseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/anthropic(\/v1)?$/, "");
  if (!URL.parse(root)) {
    throw new Error(`Invalid FOUNDRY_BASE_URL: '${rawBaseUrl}' is not an absolute URL`);
  }
  return `${root}/anthropic/v1`;
}

/** `createAzure` only appends `api-version` for `*.openai.azure.com` hosts. */
const appendApiVersion =
  (apiVersion: string): typeof globalThis.fetch =>
  (input, init) => {
    if (typeof input !== "string" && !(input instanceof URL)) {
      return fetch(input, init);
    }
    const url = new URL(input);
    url.searchParams.set("api-version", apiVersion);
    return fetch(url, init);
  };

/**
 * Non-throwing check: true when a supported AI provider has credentials configured.
 * Mirrors the runtime contract of `getLanguageModel` so feature flags gating AI
 * features don't light up UI that will throw on first call.
 */
export function isAiProviderConfigured(): boolean {
  return getConfiguredLLMProvider() !== null && hasValidLlmDefaultHeaders();
}

function resolveModelName(provider: LLMProvider, tier: ModelTier): string {
  return process.env[`LLM_MODEL_${tier.toUpperCase()}`] || DEFAULT_MODELS[provider][tier];
}

export function parseLlmDefaultHeaders(value = process.env.LLM_DEFAULT_HEADERS_JSON): LlmDefaultHeaders | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid LLM_DEFAULT_HEADERS_JSON: expected a JSON object with string values (${message})`, {
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid LLM_DEFAULT_HEADERS_JSON: expected a JSON object with string values");
  }

  const headers: LlmDefaultHeaders = {};
  for (const [name, headerValue] of Object.entries(parsed)) {
    if (typeof headerValue !== "string") {
      throw new Error(`Invalid LLM_DEFAULT_HEADERS_JSON: header '${name}' value must be a string`);
    }
    validateHeader(name, headerValue);
    headers[name] = headerValue;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function hasValidLlmDefaultHeaders(): boolean {
  try {
    parseLlmDefaultHeaders();
    return true;
  } catch {
    return false;
  }
}

function validateHeader(name: string, value: string): void {
  try {
    new Headers([[name, value]]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid LLM_DEFAULT_HEADERS_JSON: invalid header '${name}' (${message})`, {
      cause: error,
    });
  }
}

export function getLanguageModel(tier: ModelTier = "large"): LanguageModel {
  const provider = getConfiguredLLMProvider();
  if (!provider) {
    throw new Error(
      "No AI provider configured. Set LLM_PROVIDER to openai, gemini, azure, foundry, or bedrock. " +
        "openai/gemini require LLM_API_KEY (with optional LLM_BASE_URL); " +
        "azure requires LLM_API_KEY and AZURE_OPENAI_RESOURCE_ID or AZURE_OPENAI_BASE_URL; " +
        "foundry requires LLM_API_KEY and FOUNDRY_RESOURCE_ID or FOUNDRY_BASE_URL; " +
        "bedrock requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION."
    );
  }

  const modelName = resolveModelName(provider, tier);

  if (provider === "bedrock") {
    const bedrock = createAmazonBedrock();
    return bedrock(modelName);
  }

  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL;
  const headers = parseLlmDefaultHeaders();

  if (provider === "foundry") {
    const foundryBase = nonEmptyEnv("FOUNDRY_BASE_URL");
    const baseURL = foundryBaseUrl(
      foundryBase ?? `https://${nonEmptyEnv("FOUNDRY_RESOURCE_ID")}.services.ai.azure.com`
    );
    // Foundry accepts `createAnthropic`'s native `x-api-key` (its other key
    // header is `api-key`; `Authorization: Bearer` is the Entra ID path).
    const anthropic = createAnthropic({
      apiKey,
      baseURL,
      ...(headers ? { headers } : {}),
    });
    return anthropic(modelName);
  }

  if (provider === "azure") {
    const azureBase = nonEmptyEnv("AZURE_OPENAI_BASE_URL");
    const resolvedBase = azureBase ? azureBaseUrl(azureBase) : undefined;
    const apiVersion = nonEmptyEnv("AZURE_OPENAI_API_VERSION");
    const azure = createAzure({
      apiKey,
      ...(resolvedBase ? { baseURL: resolvedBase } : { resourceName: nonEmptyEnv("AZURE_OPENAI_RESOURCE_ID") }),
      ...(apiVersion ? { apiVersion } : {}),
      ...(headers ? { headers } : {}),
      ...(apiVersion && resolvedBase && !isAzureHost(resolvedBase) ? { fetch: appendApiVersion(apiVersion) } : {}),
    });
    return azure(modelName);
  }

  if (provider === "openai") {
    const openai = createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(headers ? { headers } : {}) });
    return openai(modelName);
  }

  const google = createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(headers ? { headers } : {}) });
  return google(modelName);
}
