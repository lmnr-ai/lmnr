import { scaleUtc } from "d3-scale";
import { differenceInMinutes } from "date-fns";
import { compact, findLastIndex, groupBy, last, map } from "lodash";

import { parseUtcTimestamp } from "@/components/chart-builder/charts/utils";

import { type TimeSeriesDataPoint, type TimeSeriesMarker } from "./types";

export type IntervalUnit = "minute" | "hour" | "day";

export interface Interval {
  value: number;
  unit: IntervalUnit;
}

const TICK_COUNT_BREAKPOINTS = [
  { minWidth: 1536, ticks: 16 },
  { minWidth: 1280, ticks: 12 },
  { minWidth: 1024, ticks: 12 },
  { minWidth: 768, ticks: 8 },
  { minWidth: 640, ticks: 6 },
  { minWidth: 0, ticks: 4 },
] as const;

export const getTickCountForWidth = (width: number): number =>
  TICK_COUNT_BREAKPOINTS.find((bp) => width >= bp.minWidth)?.ticks ?? 4;

const BAR_COUNT_BREAKPOINTS = [
  { minWidth: 1536, bars: 72 },
  { minWidth: 1280, bars: 64 },
  { minWidth: 1024, bars: 56 },
  { minWidth: 768, bars: 48 },
  { minWidth: 640, bars: 40 },
  { minWidth: 0, bars: 24 },
] as const;

export const getTargetBarsForWidth = (containerWidth: number): number => {
  const idealBars = BAR_COUNT_BREAKPOINTS.find((bp) => containerWidth >= bp.minWidth)?.bars ?? 24;

  const MIN_BAR_WIDTH = 12;
  const BAR_GAP = 2;
  const CHART_PADDING = 50;

  const availableWidth = containerWidth - CHART_PADDING;
  const maxPossibleBars = Math.max(0, Math.floor(availableWidth / (MIN_BAR_WIDTH + BAR_GAP)));

  return Math.min(idealBars, maxPossibleBars);
};

export function calculateOptimalInterval(startDate: Date, endDate: Date, targetBars: number = 16): Interval {
  const scale = scaleUtc().domain([startDate, endDate]);
  const ticks = scale.ticks(targetBars);

  if (ticks.length < 2) {
    return { value: 1, unit: "hour" };
  }

  const intervalMs = ticks[1].getTime() - ticks[0].getTime();
  const intervalMinutes = intervalMs / (1000 * 60);

  if (intervalMinutes < 60) {
    return { value: Math.max(1, Math.round(intervalMinutes)), unit: "minute" };
  } else if (intervalMinutes < 60 * 24) {
    const hours = intervalMinutes / 60;
    return { value: Math.round(hours), unit: "hour" };
  } else {
    const days = intervalMinutes / (60 * 24);
    return { value: Math.round(days), unit: "day" };
  }
}

export const normalizeTimeRange = (left: string, right: string) => {
  const leftTime = parseUtcTimestamp(left).getTime();
  const rightTime = parseUtcTimestamp(right).getTime();

  return leftTime > rightTime
    ? { start: right, end: left, startTime: rightTime, endTime: leftTime }
    : { start: left, end: right, startTime: leftTime, endTime: rightTime };
};

export const isValidZoomRange = (left: string | undefined, right: string | undefined, minMinutes: number = 5) => {
  if (!left || !right || left === right) return false;

  const normalized = normalizeTimeRange(left, right);
  const diffMinutes = differenceInMinutes(normalized.endTime, normalized.startTime);
  return diffMinutes >= minMinutes;
};

/**
 * Categorical XAxis `ReferenceLine x` must equal a bucket label. Map each
 * marker onto the last bucket that starts at or before it; drop anything past
 * the last bucket; join labels that land in the same bar.
 */
export const snapMarkersToBuckets = (
  markers: TimeSeriesMarker[] | undefined,
  data: TimeSeriesDataPoint[] | undefined
): TimeSeriesMarker[] => {
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
