import { format as fnsFormat, formatDistanceToNow } from "date-fns";
import { DateTime } from "luxon";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Branded string types — zero runtime cost, compile-time safety.
// Prevents accidentally passing a PG timestamp where CH is expected and vice versa.
// ---------------------------------------------------------------------------

declare const __ch: unique symbol;
declare const __pg: unique symbol;

/** ClickHouse DateTime64 string (UTC, no offset). e.g. "2025-09-28 15:58:59.103721364" */
export type CHTimestamp = string & { readonly [__ch]: true };

/** Postgres timestamptz string. e.g. "2025-12-26 00:36:53.245479+00" */
export type PGTimestamp = string & { readonly [__pg]: true };

/** Either DB timestamp source. */
export type Timestamp = CHTimestamp | PGTimestamp;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const CH_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const PG_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?[-+]\d{2}(?::?\d{2})?$/;

export function isClickHouse(v: string): v is CHTimestamp {
  return CH_RE.test(v);
}

export function isPostgres(v: string): v is PGTimestamp {
  return PG_RE.test(v);
}

export function isTimestamp(v: string): v is Timestamp {
  return CH_RE.test(v) || PG_RE.test(v);
}

// ---------------------------------------------------------------------------
// Zod schemas — validate + brand. The string stays flat on the wire.
// ---------------------------------------------------------------------------

export const chTimestampSchema = z
  .string()
  .refine(isClickHouse, "Invalid ClickHouse DateTime64")
  .transform((v) => v as CHTimestamp);

export const pgTimestampSchema = z
  .string()
  .refine(isPostgres, "Invalid Postgres timestamptz")
  .transform((v) => v as PGTimestamp);

export const anyTimestampSchema = z
  .string()
  .refine(isTimestamp, "Invalid timestamp")
  .transform((v) => v as Timestamp);

// ---------------------------------------------------------------------------
// Luxon parsing — the single source of truth for string → structured.
// ---------------------------------------------------------------------------

export function toLuxon(ts: Timestamp): DateTime {
  if (isClickHouse(ts)) {
    return DateTime.fromSQL(ts, { zone: "utc" });
  }
  // PG timestamptz — Luxon's fromSQL handles the offset natively
  return DateTime.fromSQL(ts);
}

/** Parse to epoch milliseconds. */
export function toEpochMs(ts: Timestamp): number {
  return toLuxon(ts).toMillis();
}

/** Parse to JS Date (useful for date-fns, d3, etc.). */
export function toDate(ts: Timestamp): Date {
  return toLuxon(ts).toJSDate();
}

// ---------------------------------------------------------------------------
// Display — browser-local timezone formatting
// ---------------------------------------------------------------------------

/**
 * Format in browser-local timezone using a date-fns pattern.
 * @example formatLocal(ts, "MMM d, HH:mm:ss.SSS")
 */
export function formatLocal(ts: Timestamp, pattern: string): string {
  return fnsFormat(toDate(ts), pattern);
}

/**
 * Format using Luxon's own pattern (good for timezone-aware display).
 * @example formatLuxon(ts, "MMMM d, yyyy, h:mm a ZZZZ")
 *          → "September 28, 2025, 6:58 PM GMT+3"
 */
export function formatLuxon(ts: Timestamp, pattern: string): string {
  return toLuxon(ts).toLocal().toFormat(pattern);
}

/** "2 hours ago", "in 5 minutes" etc. */
export function formatRelative(ts: Timestamp): string {
  return formatDistanceToNow(toDate(ts), { addSuffix: true });
}

/** Show UTC string for tooltips / debugging. */
export function formatUTC(ts: Timestamp): string {
  return isClickHouse(ts) ? `${ts} UTC` : ts;
}

// ---------------------------------------------------------------------------
// Arithmetic — luxon handles DST, leap seconds, etc.
// ---------------------------------------------------------------------------

function fracPrecision(raw: string): number {
  const dot = raw.indexOf(".");
  if (dot === -1) return 0;
  const match = raw.slice(dot + 1).match(/^(\d+)/);
  return match ? match[1].length : 0;
}

function toLuxonCH(dt: DateTime, precision: number): CHTimestamp {
  const base = dt.toUTC().toSQL({ includeOffset: false, includeZone: false })!;
  const [main, frac = ""] = base.split(".");
  if (precision === 0) return main as CHTimestamp;
  const padded = (frac || "").replace(/\s/g, "").padEnd(precision, "0").slice(0, precision);
  return `${main}.${padded}` as CHTimestamp;
}

function toLuxonPG(dt: DateTime, precision: number): PGTimestamp {
  const utc = dt.toUTC();
  const base = utc.toSQL({ includeOffset: false, includeZone: false })!;
  const [main, frac = ""] = base.split(".");
  if (precision === 0) return `${main}+00` as PGTimestamp;
  const padded = (frac || "").replace(/\s/g, "").padEnd(precision, "0").slice(0, precision);
  return `${main}.${padded}+00` as PGTimestamp;
}

/**
 * Offset by ±N seconds. Returns the same branded type.
 * Full sub-ms precision of the raw string can't be preserved (JS has only ms),
 * but that's fine since whole-second shifts are the use case.
 *
 * @example offsetSeconds(spanStart, -1)  // widen query start by 1s
 * @example offsetSeconds(spanEnd, +1)    // widen query end by 1s
 */
export function offsetSeconds<T extends Timestamp>(ts: T, seconds: number): T {
  const dt = toLuxon(ts).plus({ seconds });
  const prec = fracPrecision(ts);
  if (isClickHouse(ts)) return toLuxonCH(dt, prec) as T;
  return toLuxonPG(dt, prec) as T;
}

/**
 * Offset by an arbitrary Luxon duration.
 * @example offsetBy(ts, { hours: -2, minutes: 30 })
 */
export function offsetBy<T extends Timestamp>(ts: T, duration: Parameters<DateTime["plus"]>[0]): T {
  const dt = toLuxon(ts).plus(duration);
  const prec = fracPrecision(ts);
  if (isClickHouse(ts)) return toLuxonCH(dt, prec) as T;
  return toLuxonPG(dt, prec) as T;
}

// ---------------------------------------------------------------------------
// Cross-DB conversion
// ---------------------------------------------------------------------------

/** Convert any Timestamp to ClickHouse format (UTC, no offset). */
export function toCHFormat(ts: Timestamp): CHTimestamp {
  if (isClickHouse(ts)) return ts;
  return toLuxonCH(toLuxon(ts), fracPrecision(ts));
}

/** Convert any Timestamp to Postgres format (with +00 offset). */
export function toPGFormat(ts: Timestamp): PGTimestamp {
  if (isPostgres(ts)) return ts;
  return toLuxonPG(toLuxon(ts), fracPrecision(ts));
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

export function isBefore(a: Timestamp, b: Timestamp): boolean {
  return toEpochMs(a) < toEpochMs(b);
}

export function isAfter(a: Timestamp, b: Timestamp): boolean {
  return toEpochMs(a) > toEpochMs(b);
}

export function durationMs(start: Timestamp, end: Timestamp): number {
  return toEpochMs(end) - toEpochMs(start);
}

// ---------------------------------------------------------------------------
// d3 interop
// ---------------------------------------------------------------------------

export function toD3Domain(timestamps: Timestamp[]): [Date, Date] {
  const epochs = timestamps.map(toEpochMs).sort((a, b) => a - b);
  return [new Date(epochs[0]), new Date(epochs[epochs.length - 1])];
}

// ---------------------------------------------------------------------------
// ISO string ↔ Timestamp bridging
//
// Many parts of the codebase use ISO strings (from URL params, `toISOString()`,
// etc.). These helpers bridge between ISO and the branded types.
// ---------------------------------------------------------------------------

/** Convert an ISO string or Date to a CHTimestamp (UTC, no offset). */
export function isoToCH(iso: string | Date): CHTimestamp {
  const dt = iso instanceof Date ? DateTime.fromJSDate(iso, { zone: "utc" }) : DateTime.fromISO(iso, { zone: "utc" });
  return toLuxonCH(dt, 3);
}

/** Convert an ISO string or Date to a PGTimestamp (with +00 offset). */
export function isoToPG(iso: string | Date): PGTimestamp {
  const dt = iso instanceof Date ? DateTime.fromJSDate(iso, { zone: "utc" }) : DateTime.fromISO(iso, { zone: "utc" });
  return toLuxonPG(dt, 6);
}

/**
 * Best-effort parsing: accepts CH, PG, or ISO strings and returns
 * a Date. This is the recommended replacement for the scattered
 * `new Date(timestamp)` and `new Date(timestamp + "Z")` patterns.
 */
export function parseTimestampToDate(raw: string): Date {
  if (isClickHouse(raw)) return toDate(raw);
  if (isPostgres(raw)) return toDate(raw);
  // Treat as ISO or generic date string
  return new Date(raw);
}

/**
 * Best-effort parsing to epoch ms. Handles CH, PG, and ISO strings.
 */
export function parseTimestampToMs(raw: string): number {
  if (isClickHouse(raw)) return toEpochMs(raw);
  if (isPostgres(raw)) return toEpochMs(raw);
  return new Date(raw).getTime();
}

// ---------------------------------------------------------------------------
// Query param helpers
//
// ClickHouse expects UTC datetime without offset. The codebase currently does
// `.toISOString().replace("T"," ").replace("Z","")` everywhere. These helpers
// centralize that pattern.
// ---------------------------------------------------------------------------

/** Strip "Z" and "T" from an ISO string to produce a CH-compatible datetime string. */
export function isoToClickHouseParam(iso: string): string {
  return iso.replace("T", " ").replace("Z", "");
}

/**
 * Convert any timestamp or ISO string to a ClickHouse query parameter string.
 * If it's already a CHTimestamp, returns the raw string (preserving precision).
 */
export function toClickHouseParam(raw: string): string {
  if (isClickHouse(raw)) return raw;
  if (isPostgres(raw)) return toCHFormat(raw);
  return isoToClickHouseParam(raw);
}
