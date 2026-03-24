/**
 * Hardcoded provider → mustache key map for known LLM output schemas.
 * When an LLM span's output matches a known provider shape, we use the
 * corresponding mustache key directly — no model call needed.
 */

type ProviderSchema = {
  /** Dot-separated top-level keys that must exist in the output object */
  requiredKeys: string[];
  /** Mustache key to extract the most readable content */
  mustacheKey: string;
};

const PROVIDER_SCHEMAS: ProviderSchema[] = [
  // OpenAI / Azure — responses always include "object" (e.g. "chat.completion")
  {
    requiredKeys: ["choices", "object"],
    mustacheKey: "{{choices.0.message.content}}",
  },
  // Anthropic — responses include "role" and "stop_reason"
  {
    requiredKeys: ["content", "role", "stop_reason"],
    mustacheKey: "{{content.0.text}}",
  },
  // Google (Gemini) — "candidates" is already highly specific
  {
    requiredKeys: ["candidates"],
    mustacheKey: "{{candidates.0.content.parts.0.text}}",
  },
  // Cohere — responses include "generation_id"
  {
    requiredKeys: ["text", "generation_id"],
    mustacheKey: "{{text}}",
  },
  // Cohere v2 (chat) — responses include "chat_history" or "finish_reason"
  {
    requiredKeys: ["message", "finish_reason"],
    mustacheKey: "{{message.content.0.text}}",
  },
];

/**
 * Checks if the top-level keys of `data` match any known provider schema.
 * Returns the corresponding mustache key on match, or null if no match.
 */
export function matchProviderSchema(data: unknown): string | null {
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const keys = Object.keys(data as Record<string, unknown>);
  const keySet = new Set(keys);

  for (const schema of PROVIDER_SCHEMAS) {
    if (schema.requiredKeys.every((k) => keySet.has(k))) {
      return schema.mustacheKey;
    }
  }

  return null;
}
