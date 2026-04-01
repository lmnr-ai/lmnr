import { get, has, isPlainObject } from "lodash";

import { type ProviderHint } from "./utils.ts";

export type ProviderKeyMatch = {
  key: string;
  /** When set, use this instead of the original data for Mustache rendering. */
  data?: unknown;
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

const hasOpenAIToolCalls = (choice: Obj): boolean => {
  const tcs = get(choice, "message.tool_calls");
  return Array.isArray(tcs) && tcs.some((tc) => isPlainObject(get(tc, "function")));
};

const hasMessageContent = (choice: Obj): boolean => {
  const content = get(choice, "message.content");
  return content === null || typeof content === "string";
};

const hasGeminiFunctionCall = (candidate: Obj): boolean => {
  const parts = get(candidate, "content.parts");
  return Array.isArray(parts) && parts.some((p) => isPlainObject(get(p, "function_call")));
};

const hasGeminiText = (candidate: Obj): boolean =>
  !hasGeminiFunctionCall(candidate) && typeof get(candidate, "content.parts.0.text") === "string";

const hasAnthropicTextContent = (msg: Obj): boolean => {
  const content = msg.content;
  if (Array.isArray(content)) return typeof get(content, "0.text") === "string" && get(content, "0.type") === "text";
  return typeof content === "string" && has(msg, "role");
};

const hasMixedToolContent = (msg: Obj): boolean => {
  const content = msg.content;
  return (
    Array.isArray(content) && content.some((i) => isPlainObject(i) && (i.type === "tool_call" || i.type === "tool_use"))
  );
};

const isLangChainAssistant = (msg: Obj): boolean => {
  if (msg.role !== "assistant" && msg.role !== "ai") return false;
  const content = msg.content;
  if (typeof content === "string") return true;
  if (Array.isArray(content)) return get(content, "0.type") === "text" && typeof get(content, "0.text") === "string";
  return false;
};

// ---------------------------------------------------------------------------
// Transform helpers — truncate tool-call arguments for compact display
// ---------------------------------------------------------------------------

const MAX_ARGS_LENGTH = 80;
const truncate = (str: string, max: number): string => (str.length > max ? str.slice(0, max) + "…" : str);
const toStr = (val: unknown): string => truncate(typeof val === "string" ? val : JSON.stringify(val), MAX_ARGS_LENGTH);

const stringifyMixedArgs = (data: Obj): Obj => ({
  ...data,
  content: (data.content as unknown[]).map((item) => {
    if (!isPlainObject(item)) return item;
    const obj = item as Obj;
    if (obj.type === "tool_call" && has(obj, "arguments")) return { ...obj, arguments: toStr(obj.arguments) };
    if (obj.type === "tool_use" && has(obj, "input")) return { ...obj, input: toStr(obj.input) };
    return obj;
  }),
});

const stringifyOpenAIToolCalls = (choice: Obj): Obj => {
  const msg = choice.message as Obj;
  return {
    ...choice,
    message: {
      ...msg,
      tool_calls: (msg.tool_calls as unknown[]).map((tc) => {
        const fn = get(tc, "function") as Obj | undefined;
        if (!fn) return tc;
        return { ...(tc as Obj), function: { ...fn, arguments: toStr(fn.arguments) } };
      }),
    },
  };
};

const stringifyGeminiToolCalls = (candidate: Obj): Obj => {
  const content = candidate.content as Obj;
  return {
    ...candidate,
    content: {
      ...content,
      parts: (content.parts as unknown[]).map((p) => {
        const fc = get(p, "function_call") as Obj | undefined;
        if (!fc) return p;
        return { ...(p as Obj), function_call: { ...fc, args: toStr(fc.args) } };
      }),
    },
  };
};

const mapItems = (data: unknown, fn: (obj: Obj) => Obj): unknown =>
  Array.isArray(data)
    ? data.map((c) => (isPlainObject(c) ? fn(c as Obj) : c))
    : isPlainObject(data)
      ? fn(data as Obj)
      : data;

// ---------------------------------------------------------------------------
// Mustache key templates
// ---------------------------------------------------------------------------

const OAI_TC_INNER =
  "{{#message.tool_calls}}\n- `{{{function.name}}}({{{function.arguments}}})`{{/message.tool_calls}}";
const GEMINI_TC_INNER =
  "{{#content.parts}}{{#function_call}}\n- `{{{name}}}({{{args}}})`{{/function_call}}{{/content.parts}}";

const MIXED_TOOL_CALL_KEY =
  "{{#content}}{{#text}}{{{text}}}{{/text}}{{#arguments}}\n- `{{{name}}}({{{arguments}}})`{{/arguments}}{{/content}}";
const MIXED_TOOL_USE_KEY =
  "{{#content}}{{#text}}{{{text}}}{{/text}}{{#input}}\n- `{{{name}}}({{{input}}})`{{/input}}{{/content}}";

// ---------------------------------------------------------------------------
// Pattern definitions — ordered by priority (first match wins)
// ---------------------------------------------------------------------------

interface ProviderPattern {
  provider: ProviderHint;
  test: (data: unknown) => boolean;
  resolve: (data: unknown) => ProviderKeyMatch;
}

const patterns: ProviderPattern[] = [
  // --- OpenAI tool calls ---
  {
    provider: "openai",
    test: (data) => {
      const inner = peekInner(data, "choices") ?? peekInner(data);
      return inner !== null && hasOpenAIToolCalls(inner);
    },
    resolve: (data) => {
      const transformed = mapItems(
        isPlainObject(data) && has(data, "choices") ? (data as Obj).choices : data,
        stringifyOpenAIToolCalls
      );
      if (isPlainObject(data) && has(data, "choices"))
        return { key: `{{#choices}}${OAI_TC_INNER}{{/choices}}`, data: { ...(data as Obj), choices: transformed } };
      if (Array.isArray(data)) return { key: `{{#.}}${OAI_TC_INNER}{{/.}}`, data: transformed };
      return { key: OAI_TC_INNER, data: transformed };
    },
  },

  // --- Gemini tool calls ---
  {
    provider: "gemini",
    test: (data) => {
      const inner = peekInner(data, "candidates") ?? peekInner(data);
      return inner !== null && hasGeminiFunctionCall(inner);
    },
    resolve: (data) => {
      const transformed = mapItems(
        isPlainObject(data) && has(data, "candidates") ? (data as Obj).candidates : data,
        stringifyGeminiToolCalls
      );
      if (isPlainObject(data) && has(data, "candidates"))
        return {
          key: `{{#candidates.0.content.parts}}{{#function_call}}\n- \`{{{name}}}({{{args}}})\`{{/function_call}}{{/candidates.0.content.parts}}`,
          data: { ...(data as Obj), candidates: transformed },
        };
      if (Array.isArray(data)) return { key: `{{#.}}${GEMINI_TC_INNER}{{/.}}`, data: transformed };
      return { key: GEMINI_TC_INNER, data: transformed };
    },
  },

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

  // --- Mixed content (text + tool_call / tool_use in content array) ---
  {
    provider: "anthropic",
    test: (data) => {
      const msg = unwrapSingle(data);
      return isPlainObject(msg) && hasMixedToolContent(msg as Obj);
    },
    resolve: (data) => {
      const msg = unwrapSingle(data) as Obj;
      const hasToolCall = (msg.content as unknown[]).some((i) => isPlainObject(i) && (i as Obj).type === "tool_call");
      return {
        key: hasToolCall ? MIXED_TOOL_CALL_KEY : MIXED_TOOL_USE_KEY,
        data: stringifyMixedArgs(msg),
      };
    },
  },

  // --- Anthropic text ---
  {
    provider: "anthropic",
    test: (data) => {
      const inner = Array.isArray(data) ? data[0] : data;
      return isPlainObject(inner) && hasAnthropicTextContent(inner as Obj);
    },
    resolve: (data) => {
      if (Array.isArray(data)) {
        const first = data[0] as Obj;
        if (Array.isArray(first.content))
          return { key: "{{#.}}{{#content}}{{#text}}{{text}}{{/text}}{{/content}}{{/.}}" };
        return { key: "{{#.}}{{content}}{{/.}}" };
      }
      const obj = data as Obj;
      if (Array.isArray(obj.content)) return { key: "{{#content}}{{#text}}{{text}}{{/text}}{{/content}}" };
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
