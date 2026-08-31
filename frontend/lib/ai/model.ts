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

type LLMProvider = "openai" | "gemini" | "bedrock" | "azure_chat_completions" | "azure_responses" | "azure_anthropic";
type LlmDefaultHeaders = Record<string, string>;

// Per-provider defaults. Used when LLM_MODEL_<TIER> is not set.
const DEFAULT_MODELS: Record<LLMProvider, Record<ModelTier, string>> = {
  gemini: {
    small: "gemini-3.5-flash-lite",
    medium: "gemini-3-flash-preview",
    large: "gemini-3.1-pro-preview",
  },
  bedrock: {
    small: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    medium: "us.anthropic.claude-sonnet-5",
    large: "us.anthropic.claude-opus-5",
  },
  openai: {
    small: "gpt-5.6-luna",
    medium: "gpt-5.6-terra",
    large: "gpt-5.6-sol",
  },
  // Azure model ids are deployment names — these only hold when deployments are
  // named after the model; otherwise set LLM_MODEL_<TIER>.
  azure_chat_completions: {
    small: "gpt-5.6-luna",
    medium: "gpt-5.6-terra",
    large: "gpt-5.6-sol",
  },
  azure_responses: {
    small: "gpt-5.6-luna",
    medium: "gpt-5.6-terra",
    large: "gpt-5.6-sol",
  },
  azure_anthropic: {
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

// All three azure_* providers live on one resource and differ only in the
// API-shape path below it, so they share one endpoint pair.
function hasAzureCreds(): boolean {
  return !!process.env.LLM_API_KEY && !!(nonEmptyEnv("AZURE_RESOURCE_ID") || nonEmptyEnv("AZURE_BASE_URL"));
}

function getConfiguredLLMProvider(): LLMProvider | null {
  const provider = process.env.LLM_PROVIDER;
  if (provider === "bedrock") {
    return hasBedrockCreds() ? "bedrock" : null;
  }
  if (provider === "azure_chat_completions" || provider === "azure_responses" || provider === "azure_anthropic") {
    return hasAzureCreds() ? provider : null;
  }
  if (provider === "openai" || provider === "openai_responses") {
    return process.env.LLM_API_KEY ? "openai" : null;
  }
  if (provider === "gemini") {
    return process.env.LLM_API_KEY ? provider : null;
  }
  return null;
}

const azureEndpoint = (): string =>
  nonEmptyEnv("AZURE_BASE_URL") ?? `https://${nonEmptyEnv("AZURE_RESOURCE_ID")}.services.ai.azure.com`;

const isAzureOpenAIHost = (url: string): boolean => URL.parse(url)?.hostname.endsWith(".openai.azure.com") ?? false;

/** Host root with any API-shape path trimmed back off, so callers append their own. */
function azureResourceRoot(rawBaseUrl: string): string {
  const root = rawBaseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(openai|anthropic)(\/v1)?$/, "");
  if (!URL.parse(root)) {
    throw new Error(`Invalid AZURE_BASE_URL: '${rawBaseUrl}' is not an absolute URL`);
  }
  return root;
}

/**
 * Base URL for `createAzure`, which appends `/v1` itself only for
 * `*.openai.azure.com` hosts — the Foundry host it never matches, so that route
 * has to be spelled out in full.
 */
export function azureOpenAIBaseUrl(rawBaseUrl: string): string {
  const root = azureResourceRoot(rawBaseUrl);
  return isAzureOpenAIHost(root) ? `${root}/openai` : `${root}/openai/v1`;
}

/** Base URL for `createAnthropic`, which appends `/messages`. */
export function azureAnthropicBaseUrl(rawBaseUrl: string): string {
  return `${azureResourceRoot(rawBaseUrl)}/anthropic/v1`;
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
      "No AI provider configured. Set LLM_PROVIDER to openai, gemini, azure_chat_completions, azure_responses, " +
        "azure_anthropic, or bedrock. openai/gemini require LLM_API_KEY (with optional LLM_BASE_URL); " +
        "the azure_* providers require LLM_API_KEY and AZURE_RESOURCE_ID or AZURE_BASE_URL; " +
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

  if (provider === "azure_anthropic") {
    // `createAnthropic`'s native `x-api-key` is the header the Anthropic route
    // accepts; `api-key` 401s in practice despite the docs listing it.
    const anthropic = createAnthropic({
      apiKey,
      baseURL: azureAnthropicBaseUrl(azureEndpoint()),
      ...(headers ? { headers } : {}),
    });
    return anthropic(modelName);
  }

  if (provider === "azure_chat_completions" || provider === "azure_responses") {
    const resolvedBase = azureOpenAIBaseUrl(azureEndpoint());
    const apiVersion = nonEmptyEnv("AZURE_API_VERSION");
    const azure = createAzure({
      apiKey,
      baseURL: resolvedBase,
      ...(apiVersion ? { apiVersion } : {}),
      ...(headers ? { headers } : {}),
      ...(apiVersion && !isAzureOpenAIHost(resolvedBase) ? { fetch: appendApiVersion(apiVersion) } : {}),
    });
    // `azure(id)` is the Responses model; Chat Completions needs `.chat`.
    return provider === "azure_responses" ? azure(modelName) : azure.chat(modelName);
  }

  if (provider === "openai") {
    const openai = createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(headers ? { headers } : {}) });
    return openai(modelName);
  }

  const google = createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(headers ? { headers } : {}) });
  return google(modelName);
}
