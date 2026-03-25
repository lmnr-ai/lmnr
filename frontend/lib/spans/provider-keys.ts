/**
 * Provider → mustache key map for known LLM output schemas.
 *
 * Derived from the Zod schemas in `@/lib/spans/types`:
 *
 * - OpenAI/Azure: output is Choice[] → `choices[0].message.content`
 *   Or a single Choice → `message.content`
 * - Anthropic: output has `content` array with text blocks → `content[0].text`
 *   Or output is a message with `content` as string → `content`
 * - Gemini: output is Candidate[] → `candidates[0].content.parts[0].text`
 *   Or single Candidate → `content.parts[0].text`
 * - LangChain: output is assistant message → `content` (string) or `content[0].text`
 *
 * Each entry in the map is an array of { test, key } objects.
 * `test` is a function that checks if a parsed output matches the provider shape.
 * `key` is the mustache access path to extract the preview content.
 *
 * We try each provider's patterns in order and return the first match.
 */

interface ProviderKeyEntry {
  /** Test if the data matches this provider shape */
  test: (data: unknown) => boolean;
  /** Mustache key to extract preview */
  key: string;
}

const isObject = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === "object" && !Array.isArray(val);

const hasKey = (obj: Record<string, unknown>, key: string): boolean => key in obj;

/**
 * OpenAI/Azure patterns:
 * - Array of choices: [{ message: { content: "..." } }]
 * - Single choice: { message: { content: "..." } }
 * - Wrapped: { choices: [{ message: { content: "..." } }] }
 */
const openAIPatterns: ProviderKeyEntry[] = [
  // Wrapped format: { choices: [...] }
  {
    test: (data) => {
      if (!isObject(data) || !hasKey(data, "choices")) return false;
      const choices = data.choices;
      if (!Array.isArray(choices) || choices.length === 0) return false;
      const first = choices[0];
      return (
        isObject(first) &&
        hasKey(first, "message") &&
        isObject(first.message as unknown) &&
        hasKey(first.message as Record<string, unknown>, "content")
      );
    },
    key: "{{choices.0.message.content}}",
  },
  // Array of choices
  {
    test: (data) => {
      if (!Array.isArray(data) || data.length === 0) return false;
      const first = data[0];
      return (
        isObject(first) &&
        hasKey(first, "message") &&
        isObject(first.message as unknown) &&
        hasKey(first.message as Record<string, unknown>, "content")
      );
    },
    key: "{{#.}}{{message.content}}{{/.}}",
  },
  // Single choice
  {
    test: (data) => {
      if (!isObject(data)) return false;
      return (
        hasKey(data, "message") &&
        isObject(data.message as unknown) &&
        hasKey(data.message as Record<string, unknown>, "content")
      );
    },
    key: "{{message.content}}",
  },
];

/**
 * Anthropic patterns:
 * - { content: [{ type: "text", text: "..." }], role: "assistant" }
 * - { content: "...", role: "assistant" }
 * - Array of output messages
 */
const anthropicPatterns: ProviderKeyEntry[] = [
  // Single message with content array containing text blocks
  {
    test: (data) => {
      if (!isObject(data)) return false;
      if (!hasKey(data, "content")) return false;
      const content = data.content;
      if (!Array.isArray(content) || content.length === 0) return false;
      const first = content[0];
      return isObject(first) && first.type === "text" && hasKey(first, "text");
    },
    key: "{{#content}}{{#text}}{{text}}{{/text}}{{/content}}",
  },
  // Single message with content as string
  {
    test: (data) => {
      if (!isObject(data)) return false;
      return hasKey(data, "content") && typeof data.content === "string" && hasKey(data, "role");
    },
    key: "{{content}}",
  },
  // Array of messages — take first one's text content
  {
    test: (data) => {
      if (!Array.isArray(data) || data.length === 0) return false;
      const first = data[0];
      if (!isObject(first) || !hasKey(first, "content")) return false;
      const content = first.content;
      if (!Array.isArray(content) || content.length === 0) return false;
      return isObject(content[0]) && content[0].type === "text" && hasKey(content[0], "text");
    },
    key: "{{#.}}{{#content}}{{#text}}{{text}}{{/text}}{{/content}}{{/.}}",
  },
];

/**
 * Gemini patterns:
 * - { content: { parts: [{ text: "..." }] } } (single candidate)
 * - [{ content: { parts: [{ text: "..." }] } }] (array of candidates)
 * - { candidates: [{ content: { parts: [{ text: "..." }] } }] } (wrapped)
 */
const geminiPatterns: ProviderKeyEntry[] = [
  // Wrapped format: { candidates: [...] }
  {
    test: (data) => {
      if (!isObject(data) || !hasKey(data, "candidates")) return false;
      const candidates = data.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) return false;
      const first = candidates[0];
      return (
        isObject(first) &&
        hasKey(first, "content") &&
        isObject(first.content as unknown) &&
        hasKey(first.content as Record<string, unknown>, "parts") &&
        Array.isArray((first.content as Record<string, unknown>).parts)
      );
    },
    key: "{{candidates.0.content.parts.0.text}}",
  },
  // Single candidate
  {
    test: (data) => {
      if (!isObject(data)) return false;
      return (
        hasKey(data, "content") &&
        isObject(data.content as unknown) &&
        hasKey(data.content as Record<string, unknown>, "parts") &&
        Array.isArray((data.content as Record<string, unknown>).parts)
      );
    },
    key: "{{content.parts.0.text}}",
  },
  // Array of candidates
  {
    test: (data) => {
      if (!Array.isArray(data) || data.length === 0) return false;
      const first = data[0];
      return (
        isObject(first) &&
        hasKey(first, "content") &&
        isObject(first.content as unknown) &&
        hasKey(first.content as Record<string, unknown>, "parts")
      );
    },
    key: "{{#.}}{{content.parts.0.text}}{{/.}}",
  },
];

/**
 * LangChain patterns:
 * - { content: "...", role: "assistant"|"ai" }
 * - { content: [{ type: "text", text: "..." }], role: "assistant"|"ai" }
 */
const langchainPatterns: ProviderKeyEntry[] = [
  {
    test: (data) => {
      if (!isObject(data)) return false;
      const role = data.role;
      if (role !== "assistant" && role !== "ai") return false;
      return hasKey(data, "content") && typeof data.content === "string";
    },
    key: "{{content}}",
  },
  {
    test: (data) => {
      if (!isObject(data)) return false;
      const role = data.role;
      if (role !== "assistant" && role !== "ai") return false;
      if (!hasKey(data, "content") || !Array.isArray(data.content)) return false;
      const first = (data.content as unknown[])[0];
      return isObject(first) && first.type === "text" && hasKey(first, "text");
    },
    key: "{{content.0.text}}",
  },
];

/** All provider patterns in priority order */
const allPatterns: ProviderKeyEntry[] = [
  ...openAIPatterns,
  ...anthropicPatterns,
  ...geminiPatterns,
  ...langchainPatterns,
];

/**
 * Try to match parsed LLM output data against known provider schemas.
 * Returns the mustache key if matched, null otherwise.
 */
export const matchProviderKey = (data: unknown): string | null => {
  for (const pattern of allPatterns) {
    if (pattern.test(data)) {
      return pattern.key;
    }
  }
  return null;
};
