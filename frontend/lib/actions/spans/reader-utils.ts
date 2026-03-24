import { isEmpty as _isEmpty } from "lodash";
import Mustache from "mustache";

import { deepParseJson, tryParseJson } from "@/lib/actions/common/utils";

const MAX_FIELD_LENGTH = 200;
const MAX_PAYLOAD_SIZE = 2048;

/**
 * Deep-parse a raw span input/output value, handling double-stringification.
 */
export function parseSpanPayload(raw: unknown): unknown {
  if (typeof raw === "string") {
    return deepParseJson(tryParseJson(raw));
  }
  return deepParseJson(raw);
}

/**
 * Check if a parsed value is "empty" — null, undefined, empty string/object/array.
 */
export function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "object") return _isEmpty(value);
  return false;
}

/**
 * Check if a value is primitive (string, number, boolean) — no keys to pick from.
 */
export function isPrimitive(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Compute a type descriptor for a value (used in fingerprint generation).
 */
function typeDescriptor(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array";
    return `[${typeDescriptor(value[0])}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${k}:${typeDescriptor(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  return "unknown";
}

/**
 * Compute a deterministic schema fingerprint from a span name and parsed data.
 *
 * Format: `{span_name}:{sorted_keys_with_types}`
 * Example: `Grep:{output_mode:string,pattern:string,type:string}`
 */
export function computeFingerprint(spanName: string, data: unknown): string | null {
  if (isEmptyPayload(data) || isPrimitive(data)) return null;

  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    // Use first element's shape
    return computeFingerprint(spanName, data[0]);
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    if (keys.length === 0) return null;
    const parts = keys.map((k) => `${k}:${typeDescriptor(obj[k])}`);
    return `${spanName}:{${parts.join(",")}}`;
  }

  return null;
}

/**
 * Truncate all string values in an object to `maxLength` characters.
 */
function truncateValues(value: unknown, maxLength: number = MAX_FIELD_LENGTH): unknown {
  if (typeof value === "string") {
    return value.length > maxLength ? value.slice(0, maxLength) + "…" : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => truncateValues(v, maxLength));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = truncateValues(v, maxLength);
    }
    return result;
  }
  return value;
}

/**
 * Prepare a payload for the model: truncate field values and cap total size.
 */
export function preparePayloadForModel(data: unknown): string {
  const truncated = truncateValues(data);
  let json = JSON.stringify(truncated);
  if (json.length > MAX_PAYLOAD_SIZE) {
    json = json.slice(0, MAX_PAYLOAD_SIZE);
  }
  return json;
}

/**
 * Preprocess data for Mustache rendering — recursively traverse objects,
 * adding `${key}Json` keys for nested objects so templates can access them.
 */
export function preprocessForMustache(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") return data;

  if (Array.isArray(data)) {
    return data.map(preprocessForMustache);
  }

  if (typeof data === "object") {
    const processed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value === null || value === undefined) {
        processed[key] = value;
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        processed[key] = value;
      } else if (Array.isArray(value)) {
        processed[key] = preprocessForMustache(value);
      } else if (typeof value === "object") {
        processed[`${key}Json`] = JSON.stringify(value, null, 2);
        processed[key] = preprocessForMustache(value);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  }

  return data;
}

/**
 * Convert bracket notation (e.g. `[0]`) to dot notation (e.g. `.0`) for Mustache.js compatibility.
 * Mustache.js uses dot notation for array index access, not bracket notation.
 */
export function bracketsToDots(key: string): string {
  return key.replace(/\[(\d+)\]/g, ".$1");
}

/**
 * Validate a mustache key by rendering it against sample data.
 * Returns the rendered string if valid, or null if it fails or produces empty output.
 * Automatically converts bracket notation to dot notation for Mustache.js compatibility.
 */
export function validateMustacheKey(mustacheKey: string, data: unknown): string | null {
  try {
    const normalizedKey = bracketsToDots(mustacheKey);
    const unwrapped = Array.isArray(data) && data.length === 1 ? data[0] : data;
    const processed = preprocessForMustache(unwrapped);
    const rendered = Mustache.render(normalizedKey, processed);

    // Unescape HTML entities
    const unescaped = rendered
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'");

    if (!unescaped || unescaped.trim() === "" || unescaped === "undefined" || unescaped === "null") {
      return null;
    }

    return unescaped;
  } catch {
    return null;
  }
}
