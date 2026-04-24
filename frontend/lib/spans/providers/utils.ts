import { compact, isNil, isString } from "lodash";

/**
 * Join non-empty strings with double newline.
 * Drops empty / null / undefined entries first so callers can pass
 * parts produced by best-effort extraction without pre-filtering.
 */
export const joinNonEmpty = (parts: (string | null | undefined)[]): string => compact(parts).join("\n\n");

/**
 * True when a value is null/undefined or a string of only whitespace.
 * Useful for deciding whether an LLM message has any visible text.
 */
export const isBlank = (v: unknown): boolean => isNil(v) || (isString(v) && v.trim() === "");
