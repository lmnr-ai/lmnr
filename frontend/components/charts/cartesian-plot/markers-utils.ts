import { compact, findLastIndex, groupBy, last, map } from "lodash";

import { parseUtcTimestamp } from "@/lib/charts/time";

import { type PlotMarker } from "./types";

/**
 * Categorical XAxis `ReferenceLine x` must equal a bucket label. Map each
 * marker onto the last bucket that starts at or before it; drop anything past
 * the last bucket; join labels that land in the same bar.
 */
export const snapMarkersToBuckets = (
  markers: PlotMarker[] | undefined,
  data: { timestamp: string }[] | undefined
): PlotMarker[] => {
  if (!markers?.length || !data?.length) return [];

  const times = map(data, (d) => parseUtcTimestamp(d.timestamp).getTime());
  const step = times.length > 1 ? times[1] - times[0] : 0;
  // A single-bucket series gives no spacing to measure. Treating that bar as
  // 1ms wide would drop every marker inside it, so leave the last bucket open.
  const rangeEnd = step > 0 ? (last(times) ?? 0) + step : Infinity;

  const snapped = compact(
    map(markers, (marker) => {
      const at = parseUtcTimestamp(marker.timestamp).getTime();
      if (Number.isNaN(at) || at >= rangeEnd) return null;

      const index = findLastIndex(times, (t) => t <= at);
      if (index < 0) return null;

      return {
        timestamp: data[index].timestamp,
        label: marker.label,
        href: marker.href,
        tooltip: marker.tooltip ?? [{ label: marker.label, timestamp: marker.timestamp }],
      };
    })
  );

  return map(groupBy(snapped, "timestamp"), (group, timestamp) => ({
    timestamp,
    label: map(group, "label").join(", "),
    href: last(group)?.href,
    tooltip: group.flatMap((item) => item.tooltip ?? []),
  }));
};
