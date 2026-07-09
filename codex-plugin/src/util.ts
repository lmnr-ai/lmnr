import type { Json } from "./types.js";

/** JSON.stringify with a fallback for non-serializable values. */
export function jsonDumps(value: Json): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "bigint" || typeof v === "symbol" || typeof v === "function") {
      return String(v);
    }
    return v;
  });
}

/** Return the latest (max) of the present timestamps, or null when none are present. */
export function getLatestTimestamp(...timestamps: (Date | null | undefined)[]): Date | null {
  let latest: Date | null = null;
  for (const ts of timestamps) {
    if (ts instanceof Date && (latest === null || ts.getTime() > latest.getTime())) {
      latest = ts;
    }
  }
  return latest;
}
