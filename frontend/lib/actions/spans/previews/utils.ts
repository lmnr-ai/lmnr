import { isEmpty, isNil, isPlainObject, isString, last, mapValues } from "lodash";
import Mustache from "mustache";

import { deepParseJson } from "@/lib/actions/common/utils.ts";
import { AnthropicOutputMessageSchema, AnthropicOutputMessagesSchema } from "@/lib/spans/types/anthropic";
import { GeminiOutputSchema } from "@/lib/spans/types/gemini";
import { LangChainAssistantMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIOutputSchema } from "@/lib/spans/types/openai";

export const deepParseValue = (value: unknown): unknown => {
  if (!isString(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return isString(parsed) ? deepParseValue(parsed) : parsed;
  } catch {
    return value;
  }
};

export type PayloadClassification =
  | { kind: "primitive"; preview: string }
  | { kind: "empty"; preview: string }
  | { kind: "object"; data: Record<string, unknown> | unknown[] }
  | { kind: "raw"; preview: string };

export const classifyPayload = (raw: unknown): PayloadClassification => {
  const parsed = deepParseValue(raw);

  if (isNil(parsed)) return { kind: "empty", preview: "" };
  if (isString(parsed)) return parsed === "" ? { kind: "empty", preview: "" } : { kind: "primitive", preview: parsed };
  if (typeof parsed === "number" || typeof parsed === "boolean") return { kind: "primitive", preview: String(parsed) };

  const deepParsed = deepParseJson(parsed);

  if (Array.isArray(deepParsed)) {
    return isEmpty(deepParsed) ? { kind: "empty", preview: "" } : { kind: "object", data: deepParsed };
  }

  if (isPlainObject(deepParsed)) {
    return isEmpty(deepParsed)
      ? { kind: "empty", preview: "" }
      : { kind: "object", data: deepParsed as Record<string, unknown> };
  }

  return { kind: "raw", preview: String(deepParsed) };
};

export type ProviderHint = "openai" | "anthropic" | "gemini" | "langchain" | "unknown";

/**
 * Returns true when the parsed LLM output contains only tool calls
 * and no meaningful text/thinking content worth showing as a preview.
 */
export const isToolOnlyLlmOutput = (data: unknown): boolean => {
  const obj = isPlainObject(data) ? (data as Record<string, unknown>) : null;

  // OpenAI: choices[0].message has tool_calls but content is null/empty
  if (obj && Array.isArray(obj.choices)) {
    const msg = (obj.choices as unknown[])[0];
    if (isPlainObject(msg)) {
      const message = (msg as Record<string, unknown>).message;
      if (isPlainObject(message)) {
        const m = message as Record<string, unknown>;
        if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
          const content = m.content;
          if (content === null || content === undefined || (isString(content) && content.trim().length === 0)) {
            return true;
          }
        }
      }
    }
  }

  // Anthropic: content array has only tool_use blocks
  const contentHolder =
    obj ??
    (Array.isArray(data) && data.length === 1 && isPlainObject(data[0]) ? (data[0] as Record<string, unknown>) : null);
  if (contentHolder && Array.isArray(contentHolder.content)) {
    const blocks = contentHolder.content as unknown[];
    if (
      blocks.length > 0 &&
      blocks.every((b) => isPlainObject(b) && (b as Record<string, unknown>).type === "tool_use")
    ) {
      return true;
    }
  }

  // Gemini: candidates[0].content.parts has only functionCall parts
  if (obj && Array.isArray(obj.candidates)) {
    const candidate = (obj.candidates as unknown[])[0];
    if (isPlainObject(candidate)) {
      const content = (candidate as Record<string, unknown>).content;
      if (isPlainObject(content)) {
        const parts = (content as Record<string, unknown>).parts;
        if (
          Array.isArray(parts) &&
          parts.length > 0 &&
          parts.every((p) => isPlainObject(p) && "functionCall" in (p as Record<string, unknown>))
        ) {
          return true;
        }
      }
    }
  }

  // LangChain: tool_calls present but content is empty
  if (obj && Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
    const content = obj.content;
    if (
      content === null ||
      content === undefined ||
      content === "" ||
      (isString(content) && content.trim().length === 0)
    ) {
      return true;
    }
  }

  return false;
};

export const detectOutputStructure = (data: unknown): ProviderHint => {
  if (OpenAIOutputSchema.safeParse(data).success) return "openai";
  if (GeminiOutputSchema.safeParse(data).success) return "gemini";
  if (AnthropicOutputMessageSchema.safeParse(data).success) return "anthropic";
  if (AnthropicOutputMessagesSchema.safeParse(data).success) return "anthropic";

  // LangChain has no dedicated output schema — check for assistant message(s)
  if (LangChainAssistantMessageSchema.safeParse(data).success) return "langchain";
  if (Array.isArray(data) && LangChainMessagesSchema.safeParse(data).success) return "langchain";

  return "unknown";
};

const describeShape = (value: unknown): string => {
  if (isNil(value)) return "null";
  if (isString(value)) return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";

  if (Array.isArray(value)) {
    if (isEmpty(value)) return "[]";
    const uniqueShapes = [...new Set(value.map(describeShape))].sort();
    return uniqueShapes.length === 1 ? `[]${uniqueShapes[0]}` : `[](${uniqueShapes.join("|")})`;
  }

  if (isPlainObject(value)) {
    const obj = value as Record<string, unknown>;
    const entries = Object.keys(obj)
      .sort()
      .map((key) => `${key}:${describeShape(obj[key])}`);
    return `{${entries.join(",")}}`;
  }

  return "unknown";
};

/**
 * Generate a deterministic schema fingerprint from a JSON structure.
 */
export const generateFingerprint = (spanName: string, data: unknown): string => `${spanName}:${describeShape(data)}`;

const METADATA_KEYS = new Set([
  "id",
  "status",
  "type",
  "mode",
  "version",
  "role",
  "model",
  "usage",
  "timestamp",
  "duration",
  "finish_reason",
  "token_count",
  "index",
  "logprobs",
  "created",
  "object",
  "system_fingerprint",
]);

const IDENTIFIER_KEYS = new Set(["name", "action", "function", "method", "command", "tool"]);

export const flattenPaths = (data: unknown): string[] => {
  const paths: string[] = [];

  const walk = (value: unknown, prefix: string): void => {
    if (isNil(value)) return;

    if (isString(value) || typeof value === "number" || typeof value === "boolean") {
      const lastKey = last(prefix.split("."))?.replace(/\[\]$/, "") ?? "";
      const tag = METADATA_KEYS.has(lastKey) ? " [meta]" : IDENTIFIER_KEYS.has(lastKey) ? " [id]" : "";
      paths.push(`${prefix}: ${typeof value}${tag}`);
      return;
    }

    if (Array.isArray(value)) {
      if (!isEmpty(value)) walk(value[0], `${prefix}[]`);
      return;
    }

    if (isPlainObject(value)) {
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        walk(obj[key], prefix ? `${prefix}.${key}` : key);
      }
    }
  };

  walk(data, "");
  return paths;
};

const HTML_ENTITY_MAP: Record<string, string> = {
  "&quot;": '"',
  "&#x27;": "'",
  "&#x2F;": "/",
  "&#x60;": "`",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

const ENTITY_REGEX = new RegExp(Object.keys(HTML_ENTITY_MAP).join("|"), "g");

const unescapeHtml = (str: string): string => str.replace(ENTITY_REGEX, (match) => HTML_ENTITY_MAP[match]);

/**
 * Add a non-enumerable toString to objects/arrays so Mustache renders them
 * as JSON strings when used as {{variable}}, while still allowing section
 * blocks like {{#obj}}{{field}}{{/obj}} to drill into them.
 */
const addStringifyToObjects = (value: unknown): unknown => {
  if (isNil(value) || isString(value) || typeof value === "number" || typeof value === "boolean") return value;

  const attach = (target: object, raw: unknown) =>
    Object.defineProperty(target, "toString", { value: () => JSON.stringify(raw), enumerable: false });

  if (Array.isArray(value)) {
    const mapped = value.map(addStringifyToObjects);
    attach(mapped, value);
    return mapped;
  }

  if (isPlainObject(value)) {
    const result = mapValues(value as Record<string, unknown>, addStringifyToObjects);
    attach(result, value);
    return result;
  }

  return value;
};

const prepareRenderTarget = (data: unknown): unknown => {
  const deepParsed = deepParseJson(data);
  return addStringifyToObjects(deepParsed);
};

export const validateMustacheKey = (key: string, data: unknown): string | null => {
  try {
    const rendered = unescapeHtml(Mustache.render(key, prepareRenderTarget(data)));
    if (!rendered || rendered.trim() === "" || rendered.includes("[object Object]")) return null;
    return rendered;
  } catch {
    return null;
  }
};
