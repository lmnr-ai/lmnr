import { isBoolean, isEmpty, isNil, isNumber, isPlainObject, isString } from "lodash";

import { deepParseJson } from "@/lib/actions/common/utils.ts";

import { METADATA_KEYS } from "./utils";

// Descriptive content fields we prefer to surface, in order of preference.
const PRIORITY_KEYS: readonly string[] = [
  "description",
  "summary",
  "command",
  "query",
  "action",
  "prompt",
  "message",
  "text",
  "content",
  "answer",
  "title",
  "path",
  "url",
  "code",
  "output",
  "result",
  "tool",
  "function",
  "name",
];

const isLeaf = (v: unknown): v is string | number | boolean => isString(v) || isNumber(v) || isBoolean(v);

const formatLeaf = (v: string | number | boolean): string | null => {
  if (isNumber(v) || isBoolean(v)) return String(v);
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
};

// Recursively find the first non-empty primitive value stored under `target`.
const findByKey = (value: unknown, target: string): string | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findByKey(item, target);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;

  const obj = value as Record<string, unknown>;
  const direct = obj[target];
  if (isLeaf(direct)) {
    const formatted = formatLeaf(direct);
    if (formatted !== null) return formatted;
  }
  for (const k of Object.keys(obj)) {
    if (METADATA_KEYS.has(k)) continue;
    const hit = findByKey(obj[k], target);
    if (hit !== null) return hit;
  }
  return null;
};

// Absolute last resort: first non-metadata primitive leaf in declaration order.
const firstNonMetaLeaf = (value: unknown): string | null => {
  if (isNil(value)) return null;
  if (isLeaf(value)) return formatLeaf(value);

  if (Array.isArray(value)) {
    if (isEmpty(value)) return null;
    for (const item of value) {
      const hit = firstNonMetaLeaf(item);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;

  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (METADATA_KEYS.has(k)) continue;
    const hit = firstNonMetaLeaf(obj[k]);
    if (hit !== null) return hit;
  }
  return null;
};

/**
 * Fallback preview used when no AI provider is configured or LLM-key
 * generation fails. Searches for keys in `PRIORITY_KEYS` order, then falls
 * back to the first non-metadata primitive leaf. Not cached.
 */
export const tryHeuristicPreview = (data: unknown): string | null => {
  const parsed = deepParseJson(data);
  for (const key of PRIORITY_KEYS) {
    const hit = findByKey(parsed, key);
    if (hit !== null) return hit;
  }
  return firstNonMetaLeaf(parsed);
};
