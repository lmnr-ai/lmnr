import { isEmpty } from "lodash";
import Mustache from "mustache";

/**
 * Recursively parse JSON strings until the result is no longer a string.
 * Handles double-stringified values common in ClickHouse storage.
 */
export const deepParseValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return deepParseValue(parsed);
    return parsed;
  } catch {
    return value;
  }
};

/**
 * Recursively deep-parse all JSON string values within an object/array tree.
 * Unlike deepParseValue (which only unwraps a single stringified value),
 * this walks the entire structure and parses every string field that looks
 * like JSON, then recurses into the parsed result.
 */
export const deepParseAllValues = (value: unknown): unknown => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return deepParseAllValues(parsed);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map(deepParseAllValues);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepParseAllValues(v)]));
  }

  return value;
};

/**
 * Classify a parsed payload into one of:
 * - "primitive": string, number, boolean — return as-is
 * - "empty": null, undefined, "", or {} — return empty string
 * - "object": non-empty object or array — proceed to fingerprinting
 * - "raw": parse failed entirely — return raw value as string
 */
export type PayloadClassification =
  | { kind: "primitive"; preview: string }
  | { kind: "empty"; preview: string }
  | { kind: "object"; data: Record<string, unknown> | unknown[] }
  | { kind: "raw"; preview: string };

export const classifyPayload = (raw: unknown): PayloadClassification => {
  const parsed = deepParseValue(raw);

  if (parsed === null || parsed === undefined) {
    return { kind: "empty", preview: "" };
  }

  if (typeof parsed === "string") {
    if (parsed === "") return { kind: "empty", preview: "" };
    return { kind: "primitive", preview: parsed };
  }

  if (typeof parsed === "number" || typeof parsed === "boolean") {
    return { kind: "primitive", preview: String(parsed) };
  }

  const deepParsed = deepParseAllValues(parsed);

  if (Array.isArray(deepParsed)) {
    if (deepParsed.length === 0) return { kind: "empty", preview: "" };
    return { kind: "object", data: deepParsed };
  }

  if (typeof deepParsed === "object" && deepParsed !== null) {
    if (isEmpty(deepParsed)) return { kind: "empty", preview: "" };
    return { kind: "object", data: deepParsed as Record<string, unknown> };
  }

  return { kind: "raw", preview: String(deepParsed) };
};

/**
 * Generate a deterministic schema fingerprint from a JSON structure.
 *
 * Format: {span_name}:{sorted_keys_with_types}
 *
 * Rules:
 * - Keys are sorted alphabetically at each level
 * - Types are JS typeof: string, number, boolean, object, null
 * - Nested objects: represented inline with braces
 * - Arrays: use first element's shape with [] prefix
 * - Purely deterministic — same structure always yields same fingerprint
 */
export const generateFingerprint = (spanName: string, data: unknown): string => {
  const shapeStr = describeShape(data);
  return `${spanName}:${shapeStr}`;
};

const describeShape = (value: unknown): string => {
  if (value === null || value === undefined) return "null";

  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const itemShape = describeShape(value[0]);
    return `[]${itemShape}`;
  }

  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${key}:${describeShape((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }

  return "unknown";
};

/**
 * Truncate individual field values in an object for LLM payload preparation.
 * Caps string values to maxChars characters.
 */
export const truncateFieldValues = (data: unknown, maxChars: number = 500): unknown => {
  if (typeof data === "string") {
    return data.length > maxChars ? data.slice(0, maxChars) + "…" : data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => truncateFieldValues(item, maxChars));
  }

  if (data !== null && typeof data === "object") {
    return Object.fromEntries(Object.entries(data).map(([key, val]) => [key, truncateFieldValues(val, maxChars)]));
  }

  return data;
};

const postProcessRendered = (str: string): string =>
  str
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x60;/g, "`")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * Add a non-enumerable toString to objects/arrays so Mustache renders them
 * as JSON strings when used as {{variable}}, while still allowing section
 * blocks like {{#obj}}{{field}}{{/obj}} to drill into them.
 */
const addStringifyToObjects = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const mapped = value.map(addStringifyToObjects);
    Object.defineProperty(mapped, "toString", {
      value: () => JSON.stringify(value),
      enumerable: false,
    });
    return mapped;
  }

  if (typeof value === "object") {
    const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, addStringifyToObjects(v)]));
    Object.defineProperty(result, "toString", {
      value: () => JSON.stringify(value),
      enumerable: false,
    });
    return result;
  }

  return value;
};

/**
 * Prepare data for mustache rendering: deep-parse JSON strings, unwrap
 * single-element arrays, and add toString on objects so {{variable}}
 * references render as JSON instead of [object Object].
 */
const prepareRenderTarget = (data: unknown): unknown => {
  const deepParsed = deepParseAllValues(data);
  const unwrapped = Array.isArray(deepParsed) && deepParsed.length === 1 ? deepParsed[0] : deepParsed;
  return addStringifyToObjects(unwrapped);
};

/**
 * Validate a mustache key by rendering it against sample data.
 * Returns the rendered string if valid, null if invalid.
 */
export const validateMustacheKey = (key: string, data: unknown): string | null => {
  try {
    const renderTarget = prepareRenderTarget(data);
    const rendered = Mustache.render(key, renderTarget);
    const processed = postProcessRendered(rendered);

    if (!processed || processed.trim() === "" || processed.includes("[object Object]")) return null;

    return processed;
  } catch {
    return null;
  }
};

/**
 * Render a mustache key against data, returning the preview string.
 */
export const renderMustachePreview = (key: string, data: unknown): string => {
  try {
    const renderTarget = prepareRenderTarget(data);
    const rendered = Mustache.render(key, renderTarget);
    return postProcessRendered(rendered);
  } catch {
    return "";
  }
};
