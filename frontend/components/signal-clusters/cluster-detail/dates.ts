/** "Nov 3" for an ISO timestamp or `YYYY-MM-DD` day, in UTC to match the daily buckets. */
export const dayLabel = (value: string) =>
  new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Index of the timestamp's UTC day in `days`, or -1 when it falls outside the window. */
export const dayIndexOf = (days: string[], iso: string) => days.indexOf(iso.slice(0, 10));

/** The open resolution's start, if the cluster is resolved now. */
export const openResolutionAt = (resolutions: { resolvedAt: string; reopenedAt: string | null }[]) =>
  resolutions.findLast((r) => r.reopenedAt === null)?.resolvedAt ?? null;
