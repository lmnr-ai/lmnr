// ClickHouse DateTime64 — up to nanosecond precision, no offset
// https://clickhouse.com/docs/sql-reference/data-types/datetime64
const DATETIME64_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
// Postgres timestamptz — microsecond precision with timezone offset
const TIMESTAMPTZ_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?[-+]\d{2}(?::?\d{2})?$/;

/** Normalize SQL datetime strings to ISO 8601 for native Date parsing. */
function toISO(raw: string): string {
  if (DATETIME64_RE.test(raw)) return raw.replace(" ", "T") + "Z";
  if (TIMESTAMPTZ_RE.test(raw)) {
    return raw.replace(" ", "T").replace(/([-+]\d{2}):?(\d{2})?$/, (_, hh, mm) => `${hh}:${mm || "00"}`);
  }
  return raw;
}

/** Parse any timestamp string (DateTime64, timestamptz, or ISO) to Date. Sub-ms precision is truncated. */
export function parseTimestampToDate(raw: string): Date {
  return new Date(toISO(raw));
}

/** Parse any timestamp string (DateTime64, timestamptz, or ISO) to epoch ms. Sub-ms precision is truncated. */
export function parseTimestampToMs(raw: string): number {
  return new Date(toISO(raw)).getTime();
}

/** Convert an ISO string or Date to a UTC SQL datetime string (no offset). */
export function isoToCH(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

/** Strip "T" and "Z" from an ISO string to produce a SQL datetime string. */
export function isoToClickHouseParam(iso: string): string {
  return iso.replace("T", " ").replace("Z", "");
}

/** Convert any timestamp string to a UTC SQL datetime query parameter. */
export function toClickHouseParam(raw: string): string {
  if (DATETIME64_RE.test(raw)) return raw;
  if (TIMESTAMPTZ_RE.test(raw)) return isoToCH(new Date(toISO(raw)));
  return isoToClickHouseParam(raw);
}
