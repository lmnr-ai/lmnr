import { z } from "zod/v4";

// Wire names must match `LlmProfileProvider` in `app-server/src/llm/profiles/mod.rs`.
export const LLM_PROFILE_PROVIDERS = [
  "openai_completions",
  "openai_responses",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
  "bedrock",
  "azure_chat_completions",
  "azure_responses",
  "azure_anthropic",
  "custom",
] as const;

export type LlmProfileProvider = (typeof LLM_PROFILE_PROVIDERS)[number];

export const OPENAI_PROVIDERS = ["openai_completions", "openai_responses"] as const;
export type OpenAIProvider = (typeof OPENAI_PROVIDERS)[number];

export const AZURE_PROVIDERS = ["azure_chat_completions", "azure_responses", "azure_anthropic"] as const;
export type AzureProvider = (typeof AZURE_PROVIDERS)[number];

/** Providers whose whole config is an API key. */
const API_KEY_PROVIDERS = ["openai_completions", "openai_responses", "anthropic", "gemini", "groq", "mistral"] as const;

// RFC 7230 token: the characters allowed in an HTTP header name.
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

const HeaderNameSchema = z.string().trim().min(1).max(256).regex(HEADER_NAME_RE, "Invalid HTTP header name");

const SecretValueSchema = z
  .string()
  .min(1)
  .max(8192)
  .refine((v) => !/[\r\n]/.test(v), "Value must not contain line breaks");

const HttpUrlSchema = z
  .url({ protocol: /^https?$/, error: "URL must start with http:// or https://" })
  .transform((u) => u.replace(/\/+$/, ""));

const ApiKeyAuthSchema = z.object({ type: z.literal("api_key") });

const ApiKeyConfigSchema = z.object({ auth: ApiKeyAuthSchema });

const AzureConfigSchema = z
  .object({
    resourceId: z.string().trim().max(256).optional(),
    baseUrl: HttpUrlSchema.optional(),
    apiVersion: z.string().trim().max(64).optional(),
    auth: ApiKeyAuthSchema,
  })
  .refine((c) => !!c.resourceId !== !!c.baseUrl, {
    message: "Provide exactly one of resource id or base URL",
    path: ["resourceId"],
  });

const BedrockConfigSchema = z.object({
  region: z.string().trim().min(1).max(64),
  auth: z.discriminatedUnion("type", [
    z.object({ type: z.literal("aws_keys"), accessKeyId: z.string().trim().min(1).max(256) }),
    z.object({ type: z.literal("bearer_token") }),
  ]),
});

const CustomConfigSchema = z.object({
  baseUrl: HttpUrlSchema,
  headerNames: z
    .array(HeaderNameSchema)
    .max(32)
    .default([])
    .refine((names) => new Set(names.map((n) => n.toLowerCase())).size === names.length, {
      message: "Header names must be unique",
    }),
  auth: ApiKeyAuthSchema,
});

/**
 * Plaintext, provider-specific part of a profile; the `auth.type` tag says which
 * secret fields the encrypted blob must carry. Branches are grouped by shared
 * config, matching the form's provider select.
 */
export const LlmProfileConfigSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal(API_KEY_PROVIDERS), config: ApiKeyConfigSchema }),
  z.object({ provider: z.literal(AZURE_PROVIDERS), config: AzureConfigSchema }),
  z.object({ provider: z.literal("bedrock"), config: BedrockConfigSchema }),
  z.object({ provider: z.literal("custom"), config: CustomConfigSchema }),
]);

export type LlmProfileConfig = z.infer<typeof LlmProfileConfigSchema>;

/** Decrypted contents of `llm_profiles.secrets`. Every field is optional on the wire; which are required follows from `config`. */
export const LlmProfileSecretsSchema = z.object({
  apiKey: SecretValueSchema.optional(),
  secretAccessKey: SecretValueSchema.optional(),
  token: SecretValueSchema.optional(),
  headers: z.record(HeaderNameSchema, SecretValueSchema).optional(),
});

export type LlmProfileSecrets = z.infer<typeof LlmProfileSecretsSchema>;

export const LlmProfileModelsSchema = z
  .array(z.string().trim().min(1).max(256))
  .min(1, "Add at least one model")
  .max(64)
  .refine((models) => new Set(models).size === models.length, { message: "Model names must be unique" });

export const LlmProfileNameSchema = z.string().trim().min(1, "Name is required").max(255);

export type SecretKey = "apiKey" | "secretAccessKey" | "token";

/** The secret field the profile's `config` requires to be present. */
export function requiredSecretKey(profile: LlmProfileConfig): SecretKey {
  if (profile.provider !== "bedrock") return "apiKey";
  return profile.config.auth.type === "aws_keys" ? "secretAccessKey" : "token";
}

/**
 * What a client sees instead of the secrets: a `first3***last3` mask per stored
 * value (null when absent) so users can tell which key a profile holds, and
 * header names only. Short values are fully masked to avoid revealing most of them.
 */
export type LlmProfileSecretsPresence = {
  apiKey: string | null;
  secretAccessKey: string | null;
  token: string | null;
  headers: string[];
};

const MASK_EDGE = 3;

export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= MASK_EDGE * 3) return "*".repeat(value.length);
  return `${value.slice(0, MASK_EDGE)}${"*".repeat(value.length - MASK_EDGE * 2)}${value.slice(-MASK_EDGE)}`;
}

export function secretsPresence(secrets: LlmProfileSecrets): LlmProfileSecretsPresence {
  return {
    apiKey: maskSecret(secrets.apiKey),
    secretAccessKey: maskSecret(secrets.secretAccessKey),
    token: maskSecret(secrets.token),
    headers: Object.keys(secrets.headers ?? {}),
  };
}

export type LlmProfile = LlmProfileConfig & {
  id: string;
  workspaceId: string;
  name: string;
  models: string[];
  secrets: LlmProfileSecretsPresence;
  createdAt: string;
  updatedAt: string;
};

/** Human-facing labels for saved profiles; the form collapses each family into one entry with an API-shape select. */
export const PROVIDER_LABELS: Record<LlmProfileProvider, string> = {
  openai_completions: "OpenAI (Chat Completions)",
  openai_responses: "OpenAI (Responses)",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  mistral: "Mistral",
  bedrock: "AWS Bedrock",
  azure_chat_completions: "Azure AI Foundry (Chat Completions)",
  azure_responses: "Azure AI Foundry (Responses)",
  azure_anthropic: "Azure AI Foundry (Anthropic Messages)",
  custom: "Custom (OpenAI-compatible)",
};

/** Vendor family: the icon to show and the `gen_ai.system` value the playground reports. */
export type LlmProviderFamily = "openai" | "anthropic" | "gemini" | "groq" | "mistral" | "bedrock" | "azure";

export function providerFamily(provider: LlmProfileProvider): LlmProviderFamily {
  switch (provider) {
    case "openai_completions":
    case "openai_responses":
    case "custom":
      return "openai";
    case "azure_chat_completions":
    case "azure_responses":
    case "azure_anthropic":
      return "azure";
    default:
      return provider;
  }
}

export const isOpenAIProvider = (provider: LlmProfileProvider): provider is OpenAIProvider =>
  (OPENAI_PROVIDERS as readonly string[]).includes(provider);

export const isAzureProvider = (provider: LlmProfileProvider): provider is AzureProvider =>
  (AZURE_PROVIDERS as readonly string[]).includes(provider);
