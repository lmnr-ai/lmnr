/** "Nov 3" for an ISO timestamp or `YYYY-MM-DD` day, in UTC to match the daily buckets. */
export const dayLabel = (value: string) =>
  new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Index of the timestamp's UTC day in `days`, or -1 when it falls outside the window. */
export const dayIndexOf = (days: string[], iso: string) => days.indexOf(iso.slice(0, 10));

/**
 * The bar a timestamp falls in: by elapsed 24h from `start` when the bars are counted from a range start, else by
 * UTC calendar date. -1 when it's outside the bars.
 */
export const barIndexOf = (days: string[], iso: string, start?: string, toNow = false) => {
  if (!start) return dayIndexOf(days, iso);
  const i = Math.floor((Date.parse(iso) - Date.parse(start)) / 86_400_000);
  // A range ending at "now" keeps growing after the fetch, so a resolve made since then sits on the last bar.
  if (toNow && i >= days.length) return days.length - 1;
  return i >= 0 && i < days.length ? i : -1;
};

/** The open resolution's start, if the cluster is resolved now. */
export const openResolutionAt = (resolutions: { resolvedAt: string; reopenedAt: string | null }[]) =>
  resolutions.findLast((r) => r.reopenedAt === null)?.resolvedAt ?? null;
