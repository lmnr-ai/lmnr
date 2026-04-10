import { get, has, isPlainObject } from "lodash";

import { type ProviderHint } from "./utils.ts";

export type ProviderKeyMatch = {
  key: string;
  /** When set, use this instead of the original data for Mustache rendering. */
  data?: unknown;
  /** When set, skip Mustache rendering entirely and use this string as the preview. */
  rendered?: string;
};

type Obj = Record<string, unknown>;

const unwrapSingle = (data: unknown): unknown => (Array.isArray(data) && data.length === 1 ? data[0] : data);

const peekInner = (data: unknown, wrapperKey?: string): Obj | null => {
  if (wrapperKey && isPlainObject(data)) {
    const first = get(data, [wrapperKey, 0]);
    return isPlainObject(first) ? (first as Obj) : null;
  }
  const item = Array.isArray(data) ? data[0] : data;
  return isPlainObject(item) ? (item as Obj) : null;
};

const hasMessageContent = (choice: Obj): boolean => {
  const content = get(choice, "message.content");
  return content === null || typeof content === "string";
};

const hasGeminiText = (candidate: Obj): boolean => typeof get(candidate, "content.parts.0.text") === "string";

const hasAnthropicTextContent = (msg: Obj): boolean => {
  const content = msg.content;
  if (Array.isArray(content)) {
    return content.some(
      (item) =>
        isPlainObject(item) &&
        (((item as Obj).type === "text" && typeof (item as Obj).text === "string") ||
          ((item as Obj).type === "thinking" && typeof (item as Obj).thinking === "string"))
    );
  }
  return typeof content === "string" && has(msg, "role");
};

const isLangChainAssistant = (msg: Obj): boolean => {
  if (msg.role !== "assistant" && msg.role !== "ai") return false;
  const content = msg.content;
  if (typeof content === "string") return true;
  if (Array.isArray(content)) return get(content, "0.type") === "text" && typeof get(content, "0.text") === "string";
  return false;
};

// ---------------------------------------------------------------------------
// Mustache key templates
// ---------------------------------------------------------------------------

const renderAnthropicTextBlocks = (msg: Obj): string => {
  const content = msg.content as unknown[];
  const lines: string[] = [];
  for (const item of content) {
    if (!isPlainObject(item)) continue;
    const block = item as Obj;
    if (block.type === "thinking") {
      lines.push(block.thinking as string);
    } else if (block.type === "text") {
      lines.push(block.text as string);
    }
  }
  return lines.join("\n\n");
};

// ---------------------------------------------------------------------------
// Pattern definitions — ordered by priority (first match wins)
// ---------------------------------------------------------------------------

interface ProviderPattern {
  provider: ProviderHint;
  test: (data: unknown) => boolean;
  resolve: (data: unknown) => ProviderKeyMatch;
}

const patterns: ProviderPattern[] = [
  // --- OpenAI/Azure text ---
  {
    provider: "openai",
    test: (data) => {
      const inner = peekInner(data, "choices") ?? peekInner(data);
      return inner !== null && hasMessageContent(inner);
    },
    resolve: (data) => {
      if (isPlainObject(data) && has(data, "choices")) return { key: "{{choices.0.message.content}}" };
      if (Array.isArray(data)) return { key: "{{#.}}{{message.content}}{{/.}}" };
      return { key: "{{message.content}}" };
    },
  },

  // --- Anthropic text (with optional thinking blocks) ---
  {
    provider: "anthropic",
    test: (data) => {
      const inner = Array.isArray(data) ? data[0] : data;
      return isPlainObject(inner) && hasAnthropicTextContent(inner as Obj);
    },
    resolve: (data) => {
      const msg = Array.isArray(data) ? (data[0] as Obj) : (data as Obj);
      if (Array.isArray(msg.content)) return { key: "", rendered: renderAnthropicTextBlocks(msg) };
      if (Array.isArray(data)) return { key: "{{#.}}{{content}}{{/.}}" };
      return { key: "{{content}}" };
    },
  },

  // --- Gemini text ---
  {
    provider: "gemini",
    test: (data) => {
      const inner = peekInner(data, "candidates") ?? peekInner(data);
      return inner !== null && hasGeminiText(inner);
    },
    resolve: (data) => {
      if (isPlainObject(data) && has(data, "candidates")) return { key: "{{candidates.0.content.parts.0.text}}" };
      if (Array.isArray(data)) return { key: "{{#.}}{{content.parts.0.text}}{{/.}}" };
      return { key: "{{content.parts.0.text}}" };
    },
  },

  // --- LangChain ---
  {
    provider: "langchain",
    test: (data) => {
      const inner = unwrapSingle(data);
      return isPlainObject(inner) && isLangChainAssistant(inner as Obj);
    },
    resolve: (data) => {
      const inner = unwrapSingle(data) as Obj;
      if (Array.isArray(inner.content)) {
        const first = (inner.content as unknown[])[0];
        if (isPlainObject(first) && (first as Obj).type === "text") return { key: "{{content.0.text}}" };
      }
      return { key: "{{content}}" };
    },
  },
];

export const matchProviderKey = (data: unknown, providerHint?: ProviderHint): ProviderKeyMatch | null => {
  if (providerHint && providerHint !== "unknown") {
    for (const pattern of patterns) {
      if (pattern.provider === providerHint && pattern.test(data)) {
        return pattern.resolve(data);
      }
    }
  }

  for (const pattern of patterns) {
    if (pattern.test(data)) {
      return pattern.resolve(data);
    }
  }
  return null;
};
