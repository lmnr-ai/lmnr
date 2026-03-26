export type ProviderKeyMatch = {
  key: string;
  /** When set, use this instead of the original data for Mustache rendering. */
  data?: unknown;
};

type Obj = Record<string, unknown>;

const isObj = (val: unknown): val is Obj => val !== null && typeof val === "object" && !Array.isArray(val);

const has = (obj: Obj, key: string): boolean => key in obj;

const unwrapSingle = (data: unknown): unknown => (Array.isArray(data) && data.length === 1 ? data[0] : data);

const nested = (obj: Obj, ...path: string[]): Obj | null => {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isObj(cur) || !has(cur, key)) return null;
    cur = cur[key];
  }
  return isObj(cur) ? cur : null;
};

const firstItem = (obj: Obj, key: string): unknown | null => {
  if (!has(obj, key) || !Array.isArray(obj[key])) return null;
  const arr = obj[key] as unknown[];
  return arr.length > 0 ? arr[0] : null;
};

const hasOpenAIToolCalls = (obj: Obj): boolean => {
  const msg = nested(obj, "message");
  if (!msg || !Array.isArray(msg.tool_calls)) return false;
  return (msg.tool_calls as unknown[]).some((tc) => isObj(tc) && isObj(tc.function as unknown));
};

const hasMessageContent = (obj: Obj): boolean => {
  const msg = nested(obj, "message");
  return msg !== null && has(msg, "content");
};

const hasGeminiFunctionCall = (obj: Obj): boolean => {
  const content = nested(obj, "content");
  if (!content || !Array.isArray(content.parts)) return false;
  return (content.parts as unknown[]).some(
    (p) => isObj(p) && has(p, "function_call") && isObj(p.function_call as unknown)
  );
};

const hasGeminiText = (obj: Obj): boolean => {
  const content = nested(obj, "content");
  if (!content || !Array.isArray(content.parts) || (content.parts as unknown[]).length === 0) return false;
  return !hasGeminiFunctionCall(obj);
};

const hasAnthropicTextContent = (obj: Obj): boolean => {
  if (!has(obj, "content")) return false;
  const content = obj.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    return isObj(first) && first.type === "text" && has(first, "text");
  }
  return typeof content === "string" && has(obj, "role");
};

const isLangChainAssistant = (obj: Obj): boolean => {
  const role = obj.role;
  return (role === "assistant" || role === "ai") && has(obj, "content");
};

const hasMixedToolContent = (msg: Obj): boolean => {
  if (!has(msg, "content") || !Array.isArray(msg.content)) return false;
  return (msg.content as unknown[]).some(
    (item) => isObj(item) && (item.type === "tool_call" || item.type === "tool_use")
  );
};

const MAX_ARGS_LENGTH = 80;
const truncate = (str: string, max: number): string => (str.length > max ? str.slice(0, max) + "…" : str);
const toStr = (val: unknown): string => truncate(typeof val === "string" ? val : JSON.stringify(val), MAX_ARGS_LENGTH);

const stringifyMixedArgs = (data: Obj): Obj => ({
  ...data,
  content: (data.content as unknown[]).map((item) => {
    if (!isObj(item)) return item;
    if (item.type === "tool_call" && has(item, "arguments")) return { ...item, arguments: toStr(item.arguments) };
    if (item.type === "tool_use" && has(item, "input")) return { ...item, input: toStr(item.input) };
    return item;
  }),
});

const stringifyOpenAIToolCalls = (choice: Obj): Obj => {
  const msg = choice.message as Obj;
  return {
    ...choice,
    message: {
      ...msg,
      tool_calls: (msg.tool_calls as unknown[]).map((tc) => {
        if (!isObj(tc) || !isObj(tc.function as unknown)) return tc;
        const fn = tc.function as Obj;
        return { ...tc, function: { ...fn, arguments: toStr(fn.arguments) } };
      }),
    },
  };
};

const stringifyGeminiToolCalls = (item: Obj): Obj => {
  const content = item.content as Obj;
  return {
    ...item,
    content: {
      ...content,
      parts: (content.parts as unknown[]).map((p) => {
        if (!isObj(p) || !isObj(p.function_call as unknown)) return p;
        const fc = p.function_call as Obj;
        return { ...p, function_call: { ...fc, args: toStr(fc.args) } };
      }),
    },
  };
};

const mapItems = (data: unknown, fn: (obj: Obj) => Obj): unknown =>
  Array.isArray(data) ? data.map((c) => (isObj(c) ? fn(c) : c)) : isObj(data) ? fn(data) : data;

// ---------------------------------------------------------------------------
// Helpers to peek at first inner item (bare obj, root array, or outer wrapper)
// ---------------------------------------------------------------------------

const peekInner = (data: unknown, wrapperKey?: string): Obj | null => {
  if (wrapperKey && isObj(data) && has(data, wrapperKey)) {
    const first = firstItem(data, wrapperKey);
    return isObj(first) ? first : null;
  }
  const item = Array.isArray(data) ? data[0] : data;
  return isObj(item) ? item : null;
};

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
  test: (data: unknown) => boolean;
  resolve: (data: unknown) => ProviderKeyMatch;
}

const patterns: ProviderPattern[] = [
  // --- OpenAI tool calls ---
  {
    test: (data) => {
      const inner = peekInner(data, "choices") ?? peekInner(data);
      return inner !== null && hasOpenAIToolCalls(inner);
    },
    resolve: (data) => {
      const transformed = mapItems(isObj(data) && has(data, "choices") ? data.choices : data, stringifyOpenAIToolCalls);
      if (isObj(data) && has(data, "choices"))
        return { key: `{{#choices}}${OAI_TC_INNER}{{/choices}}`, data: { ...data, choices: transformed } };
      if (Array.isArray(data)) return { key: `{{#.}}${OAI_TC_INNER}{{/.}}`, data: transformed };
      return { key: OAI_TC_INNER, data: transformed };
    },
  },

  // --- Gemini tool calls ---
  {
    test: (data) => {
      const inner = peekInner(data, "candidates") ?? peekInner(data);
      return inner !== null && hasGeminiFunctionCall(inner);
    },
    resolve: (data) => {
      const transformed = mapItems(
        isObj(data) && has(data, "candidates") ? data.candidates : data,
        stringifyGeminiToolCalls
      );
      if (isObj(data) && has(data, "candidates"))
        return {
          key: `{{#candidates.0.content.parts}}{{#function_call}}\n- \`{{{name}}}({{{args}}})\`{{/function_call}}{{/candidates.0.content.parts}}`,
          data: { ...data, candidates: transformed },
        };
      if (Array.isArray(data)) return { key: `{{#.}}${GEMINI_TC_INNER}{{/.}}`, data: transformed };
      return { key: GEMINI_TC_INNER, data: transformed };
    },
  },

  // --- OpenAI/Azure text ---
  {
    test: (data) => {
      const inner = peekInner(data, "choices") ?? peekInner(data);
      return inner !== null && hasMessageContent(inner);
    },
    resolve: (data) => {
      if (isObj(data) && has(data, "choices")) return { key: "{{choices.0.message.content}}" };
      if (Array.isArray(data)) return { key: "{{#.}}{{message.content}}{{/.}}" };
      return { key: "{{message.content}}" };
    },
  },

  // --- Mixed content (text + tool_call / tool_use in content array) ---
  {
    test: (data) => {
      const msg = unwrapSingle(data);
      return isObj(msg) && hasMixedToolContent(msg);
    },
    resolve: (data) => {
      const msg = unwrapSingle(data) as Obj;
      const hasToolCall = (msg.content as unknown[]).some((i) => isObj(i) && i.type === "tool_call");
      return {
        key: hasToolCall ? MIXED_TOOL_CALL_KEY : MIXED_TOOL_USE_KEY,
        data: stringifyMixedArgs(msg),
      };
    },
  },

  // --- Anthropic ---
  {
    test: (data) => {
      const inner = Array.isArray(data) ? data[0] : data;
      return isObj(inner) && hasAnthropicTextContent(inner);
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
    test: (data) => {
      const inner = peekInner(data, "candidates") ?? peekInner(data);
      return inner !== null && hasGeminiText(inner);
    },
    resolve: (data) => {
      if (isObj(data) && has(data, "candidates")) return { key: "{{candidates.0.content.parts.0.text}}" };
      if (Array.isArray(data)) return { key: "{{#.}}{{content.parts.0.text}}{{/.}}" };
      return { key: "{{content.parts.0.text}}" };
    },
  },

  // --- LangChain ---
  {
    test: (data) => {
      const inner = unwrapSingle(data);
      return isObj(inner) && isLangChainAssistant(inner);
    },
    resolve: (data) => {
      const inner = unwrapSingle(data) as Obj;
      if (Array.isArray(inner.content)) {
        const first = (inner.content as unknown[])[0];
        if (isObj(first) && first.type === "text") return { key: "{{content.0.text}}" };
      }
      return { key: "{{content}}" };
    },
  },
];

export const matchProviderKey = (data: unknown): ProviderKeyMatch | null => {
  for (const pattern of patterns) {
    if (pattern.test(data)) {
      return pattern.resolve(data);
    }
  }
  return null;
};
