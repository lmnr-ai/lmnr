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
  // OpenAI / Azure
  {
    requiredKeys: ["choices"],
    mustacheKey: "{{choices.0.message.content}}",
  },
  // Anthropic
  {
    requiredKeys: ["content"],
    mustacheKey: "{{content.0.text}}",
  },
  // Google (Gemini)
  {
    requiredKeys: ["candidates"],
    mustacheKey: "{{candidates.0.content.parts.0.text}}",
  },
  // Cohere
  {
    requiredKeys: ["text"],
    mustacheKey: "{{text}}",
  },
  // Cohere v2 (chat)
  {
    requiredKeys: ["message"],
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
