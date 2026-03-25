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
 * - Mixed content: assistant message with text + tool_call/tool_use blocks
 *
 * Each entry has a `test` function and a `resolve` function.
 * `test` checks if parsed output matches the provider shape.
 * `resolve` returns the mustache key and optionally transformed data
 * (e.g. stringifying object fields that Mustache can't render).
 *
 * We try each provider's patterns in order and return the first match.
 */

export type ProviderKeyMatch = {
  key: string;
  /** When set, use this instead of the original data for Mustache rendering. */
  data?: unknown;
};

interface ProviderKeyEntry {
  test: (data: unknown) => boolean;
  resolve: (data: unknown) => ProviderKeyMatch;
}

const isObject = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === "object" && !Array.isArray(val);

const hasKey = (obj: Record<string, unknown>, key: string): boolean => key in obj;

/**
 * Unwrap a single-element array to its inner value.
 * Mirrors the unwrapping in validateMustacheKey / renderMustachePreview.
 */
const unwrapSingle = (data: unknown): unknown => (Array.isArray(data) && data.length === 1 ? data[0] : data);

/**
 * Check if an object looks like an assistant message with a content array
 * that contains at least one tool_call or tool_use block.
 */
const hasMixedToolContent = (msg: Record<string, unknown>): boolean => {
  if (!hasKey(msg, "content") || !Array.isArray(msg.content)) return false;
  const content = msg.content as unknown[];
  return content.some((item) => isObject(item) && (item.type === "tool_call" || item.type === "tool_use"));
};

/**
 * Stringify object-valued `arguments` or `input` fields in content items
 * so Mustache can render them as strings instead of [object Object].
 */
const MAX_ARGS_LENGTH = 80;

const truncateStr = (str: string, max: number): string => (str.length > max ? str.slice(0, max) + "…" : str);

const stringifyToolArgs = (data: Record<string, unknown>): Record<string, unknown> => {
  const content = data.content as unknown[];
  return {
    ...data,
    content: content.map((item) => {
      if (!isObject(item)) return item;
      if (item.type === "tool_call" && hasKey(item, "arguments")) {
        const raw = typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments);
        return { ...item, arguments: truncateStr(raw, MAX_ARGS_LENGTH) };
      }
      if (item.type === "tool_use" && hasKey(item, "input")) {
        const raw = typeof item.input === "string" ? item.input : JSON.stringify(item.input);
        return { ...item, input: truncateStr(raw, MAX_ARGS_LENGTH) };
      }
      return item;
    }),
  };
};

// --- Mixed content patterns (text + tool calls) ---
// Must come before generic Anthropic/LangChain patterns since those would also match
// but produce incomplete output (missing tool call info).

const MIXED_CONTENT_TOOL_CALL_KEY =
  "{{#content}}{{#text}}{{{text}}}{{/text}}{{#arguments}}\n- `{{{name}}}({{{arguments}}})`{{/arguments}}{{/content}}";

const MIXED_CONTENT_TOOL_USE_KEY =
  "{{#content}}{{#text}}{{{text}}}{{/text}}{{#input}}\n- `{{{name}}}({{{input}}})`{{/input}}{{/content}}";

const mixedContentPatterns: ProviderKeyEntry[] = [
  // Single message or single-element array with tool_call blocks (generic/normalized format)
  {
    test: (data) => {
      const msg = unwrapSingle(data);
      if (!isObject(msg)) return false;
      if (!hasMixedToolContent(msg)) return false;
      return (msg.content as unknown[]).some((item) => isObject(item) && item.type === "tool_call");
    },
    resolve: (data) => {
      const msg = unwrapSingle(data) as Record<string, unknown>;
      return { key: MIXED_CONTENT_TOOL_CALL_KEY, data: stringifyToolArgs(msg) };
    },
  },
  // Single message or single-element array with tool_use blocks (Anthropic format)
  {
    test: (data) => {
      const msg = unwrapSingle(data);
      if (!isObject(msg)) return false;
      if (!hasMixedToolContent(msg)) return false;
      return (msg.content as unknown[]).some((item) => isObject(item) && item.type === "tool_use");
    },
    resolve: (data) => {
      const msg = unwrapSingle(data) as Record<string, unknown>;
      return { key: MIXED_CONTENT_TOOL_USE_KEY, data: stringifyToolArgs(msg) };
    },
  },
];

// --- OpenAI/Azure patterns ---

const openAIPatterns: ProviderKeyEntry[] = [
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
    resolve: () => ({ key: "{{choices.0.message.content}}" }),
  },
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
    resolve: () => ({ key: "{{#.}}{{message.content}}{{/.}}" }),
  },
  {
    test: (data) => {
      if (!isObject(data)) return false;
      return (
        hasKey(data, "message") &&
        isObject(data.message as unknown) &&
        hasKey(data.message as Record<string, unknown>, "content")
      );
    },
    resolve: () => ({ key: "{{message.content}}" }),
  },
];

// --- Anthropic patterns ---

const anthropicPatterns: ProviderKeyEntry[] = [
  {
    test: (data) => {
      if (!isObject(data)) return false;
      if (!hasKey(data, "content")) return false;
      const content = data.content;
      if (!Array.isArray(content) || content.length === 0) return false;
      const first = content[0];
      return isObject(first) && first.type === "text" && hasKey(first, "text");
    },
    resolve: () => ({ key: "{{#content}}{{#text}}{{text}}{{/text}}{{/content}}" }),
  },
  {
    test: (data) => {
      if (!isObject(data)) return false;
      return hasKey(data, "content") && typeof data.content === "string" && hasKey(data, "role");
    },
    resolve: () => ({ key: "{{content}}" }),
  },
  {
    test: (data) => {
      if (!Array.isArray(data) || data.length === 0) return false;
      const first = data[0];
      if (!isObject(first) || !hasKey(first, "content")) return false;
      const content = first.content;
      if (!Array.isArray(content) || content.length === 0) return false;
      return isObject(content[0]) && content[0].type === "text" && hasKey(content[0], "text");
    },
    resolve: () => ({ key: "{{#.}}{{#content}}{{#text}}{{text}}{{/text}}{{/content}}{{/.}}" }),
  },
];

// --- Gemini patterns ---

const geminiPatterns: ProviderKeyEntry[] = [
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
    resolve: () => ({ key: "{{candidates.0.content.parts.0.text}}" }),
  },
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
    resolve: () => ({ key: "{{content.parts.0.text}}" }),
  },
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
    resolve: () => ({ key: "{{#.}}{{content.parts.0.text}}{{/.}}" }),
  },
];

// --- LangChain patterns ---

const langchainPatterns: ProviderKeyEntry[] = [
  {
    test: (data) => {
      if (!isObject(data)) return false;
      const role = data.role;
      if (role !== "assistant" && role !== "ai") return false;
      return hasKey(data, "content") && typeof data.content === "string";
    },
    resolve: () => ({ key: "{{content}}" }),
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
    resolve: () => ({ key: "{{content.0.text}}" }),
  },
];

/** All provider patterns in priority order. Mixed content first to catch tool calls. */
const allPatterns: ProviderKeyEntry[] = [
  ...openAIPatterns,
  ...mixedContentPatterns,
  ...anthropicPatterns,
  ...geminiPatterns,
  ...langchainPatterns,
];

/**
 * Try to match parsed LLM output data against known provider schemas.
 * Returns the mustache key (and optionally transformed data) if matched, null otherwise.
 */
export const matchProviderKey = (data: unknown): ProviderKeyMatch | null => {
  for (const pattern of allPatterns) {
    if (pattern.test(data)) {
      return pattern.resolve(data);
    }
  }
  return null;
};
