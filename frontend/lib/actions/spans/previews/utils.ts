import { isEmpty, isNil, isPlainObject, isString, last, mapValues } from "lodash";
import Mustache from "mustache";

import { deepParseJson } from "@/lib/actions/common/utils.ts";
import { AnthropicOutputMessageSchema, AnthropicOutputMessagesSchema } from "@/lib/spans/types/anthropic";
import { GeminiOutputSchema } from "@/lib/spans/types/gemini";
import { LangChainAssistantMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIOutputSchema } from "@/lib/spans/types/openai";

// ---------------------------------------------------------------------------
// Payload classification
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider detection (schema-based)
// ---------------------------------------------------------------------------

export type ProviderHint = "openai" | "anthropic" | "gemini" | "langchain" | "unknown";

export const detectOutputStructure = (data: unknown): ProviderHint => {
  if (OpenAIOutputSchema.safeParse(data).success) return "openai";
  if (GeminiOutputSchema.safeParse(data).success) return "gemini";
  if (AnthropicOutputMessageSchema.safeParse(data).success) return "anthropic";
  if (AnthropicOutputMessagesSchema.safeParse(data).success) return "anthropic";

  // LangChain has no dedicated output schema — check for assistant message(s).
  if (LangChainAssistantMessageSchema.safeParse(data).success) return "langchain";
  if (Array.isArray(data) && LangChainMessagesSchema.safeParse(data).success) return "langchain";

  return "unknown";
};

// ---------------------------------------------------------------------------
// Key classification — used by fingerprinting, path flattening, and
// consumed by the heuristic module.
// ---------------------------------------------------------------------------

export const METADATA_KEYS: ReadonlySet<string> = new Set([
  "id",
  "ids",
  "status",
  "type",
  "types",
  "kind",
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
  "signature",
  "tool_use_id",
  "stop_reason",
]);

const IDENTIFIER_KEYS: ReadonlySet<string> = new Set(["name", "action", "function", "method", "command", "tool"]);

// Keys that indicate an object is a structured response, not a flat dictionary.
const STRUCTURED_FIELD_NAMES: ReadonlySet<string> = new Set([
  ...METADATA_KEYS,
  ...IDENTIFIER_KEYS,
  "content",
  "text",
  "thinking",
  "result",
  "output",
  "message",
  "answer",
  "query",
  "description",
  "summary",
  "url",
  "path",
  "args",
  "arguments",
  "input",
  "params",
  "body",
  "data",
  "response",
  "error",
  "code",
]);

// True when an object looks like a flat key→value map (e.g. locale codes to
// translations) rather than a structured response with known fields.
const isDictionaryLike = (obj: Record<string, unknown>): boolean => {
  const keys = Object.keys(obj);
  if (keys.length < 3) return false;
  if (keys.some((k) => STRUCTURED_FIELD_NAMES.has(k))) return false;
  const firstType = typeof obj[keys[0]];
  if (firstType !== "string" && firstType !== "number" && firstType !== "boolean") return false;
  return keys.every((k) => typeof obj[k] === firstType);
};

// ---------------------------------------------------------------------------
// Structural fingerprinting (cache key basis)
// ---------------------------------------------------------------------------

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
    if (isDictionaryLike(obj)) return `{*:${describeShape(obj[Object.keys(obj)[0]])}}`;
    const entries = Object.keys(obj)
      .sort()
      .map((key) => `${key}:${describeShape(obj[key])}`);
    return `{${entries.join(",")}}`;
  }
  return "unknown";
};

/** Deterministic schema fingerprint for cache lookups. */
export const generateFingerprint = (spanName: string, data: unknown): string => `${spanName}:${describeShape(data)}`;

// ---------------------------------------------------------------------------
// Path flattening — used to build the LLM prompt
// ---------------------------------------------------------------------------

const OPAQUE_VALUE_PATTERN = /^<.+ at 0x[0-9a-fA-F]+>$/;

const SAMPLE_VALUE_MAX_CHARS = 80;

// Short, single-line sample of a scalar value for the LLM prompt. Collapses
// whitespace so multi-line strings don't blow up the flattened path output.
const formatSample = (value: string | number | boolean): string => {
  const raw = typeof value === "string" ? value : String(value);
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return '""';
  const truncated =
    collapsed.length > SAMPLE_VALUE_MAX_CHARS ? `${collapsed.slice(0, SAMPLE_VALUE_MAX_CHARS)}…` : collapsed;
  return typeof value === "string" ? `"${truncated.replace(/"/g, '\\"')}"` : truncated;
};

export const flattenPaths = (data: unknown): string[] => {
  const paths: string[] = [];

  const walk = (value: unknown, prefix: string): void => {
    if (isNil(value)) return;

    if (isString(value) || typeof value === "number" || typeof value === "boolean") {
      const lastKey = last(prefix.split("."))?.replace(/\[\]$/, "") ?? "";
      let tag = METADATA_KEYS.has(lastKey) ? " [meta]" : IDENTIFIER_KEYS.has(lastKey) ? " [id]" : "";
      if (!tag && isString(value) && OPAQUE_VALUE_PATTERN.test(value)) tag = " [meta]";
      const sample = tag === " [meta]" ? "" : ` = ${formatSample(value)}`;
      paths.push(`${prefix}: ${typeof value}${tag}${sample}`);
      return;
    }

    if (Array.isArray(value)) {
      if (!isEmpty(value)) walk(value[0], `${prefix}[]`);
      return;
    }

    if (isPlainObject(value)) {
      const obj = value as Record<string, unknown>;
      if (isDictionaryLike(obj)) {
        paths.push(`${prefix}{*}: ${typeof obj[Object.keys(obj)[0]]}`);
        return;
      }
      for (const key of Object.keys(obj)) {
        walk(obj[key], prefix ? `${prefix}.${key}` : key);
      }
    }
  };

  walk(data, "");
  return paths;
};

// ---------------------------------------------------------------------------
// Mustache rendering
// ---------------------------------------------------------------------------

// Attach a non-enumerable toString so Mustache renders objects/arrays as JSON
// when used as {{var}}, while sections like {{#obj}}{{field}}{{/obj}} still work.
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

const prepareRenderTarget = (data: unknown): unknown => addStringifyToObjects(deepParseJson(data));

export const validateMustacheKey = (key: string, data: unknown): string | null => {
  try {
    const rendered = Mustache.render(key, prepareRenderTarget(data), undefined, { escape: (v) => v });
    if (!rendered) return null;
    const trimmed = rendered.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "null" || rendered.includes("[object Object]")) return null;
    return rendered;
  } catch {
    return null;
  }
};
