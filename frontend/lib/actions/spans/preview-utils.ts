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
    // If it parsed to a string, try again (double-stringified)
    if (typeof parsed === "string") return deepParseValue(parsed);
    return parsed;
  } catch {
    return value;
  }
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

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return { kind: "empty", preview: "" };
    return { kind: "object", data: parsed };
  }

  if (typeof parsed === "object") {
    if (isEmpty(parsed)) return { kind: "empty", preview: "" };
    return { kind: "object", data: parsed as Record<string, unknown> };
  }

  return { kind: "raw", preview: String(parsed) };
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
export const truncateFieldValues = (data: unknown, maxChars: number = 200): unknown => {
  if (typeof data === "string") {
    return data.length > maxChars ? data.slice(0, maxChars) + "…" : data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => truncateFieldValues(item, maxChars));
  }

  if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      result[key] = truncateFieldValues(val, maxChars);
    }
    return result;
  }

  return data;
};

/**
 * Cap total serialized payload size to approximately maxBytes.
 * Returns the original data if under limit, otherwise truncates.
 */
export const capPayloadSize = (data: unknown, maxBytes: number = 2048): unknown => {
  const serialized = JSON.stringify(data);
  if (serialized.length <= maxBytes) return data;

  // Progressively truncate fields with smaller limits
  for (const limit of [100, 50, 20]) {
    const truncated = truncateFieldValues(data, limit);
    if (JSON.stringify(truncated).length <= maxBytes) return truncated;
  }

  // Last resort: return stringified and sliced
  return serialized.slice(0, maxBytes);
};

/**
 * Validate a mustache key by rendering it against sample data.
 * Returns the rendered string if valid, null if invalid.
 */
export const validateMustacheKey = (key: string, data: unknown): string | null => {
  try {
    const renderTarget = Array.isArray(data) && data.length === 1 ? data[0] : data;
    const rendered = Mustache.render(key, renderTarget);

    // Unescape HTML entities that Mustache escaped
    const unescaped = rendered
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'");

    if (!unescaped || unescaped.trim() === "") return null;

    return unescaped;
  } catch {
    return null;
  }
};

/**
 * Render a mustache key against data, returning the preview string.
 */
export const renderMustachePreview = (key: string, data: unknown): string => {
  try {
    const renderTarget = Array.isArray(data) && data.length === 1 ? data[0] : data;
    const rendered = Mustache.render(key, renderTarget);

    return rendered
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'");
  } catch {
    return "";
  }
};
