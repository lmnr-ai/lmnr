import { scaleUtc } from "d3-scale";
import { differenceInHours } from "date-fns";

import { type ChartConfig } from "@/components/ui/chart.tsx";

export const chartConfig: ChartConfig = {
  successCount: {
    label: "success",
    color: "hsl(var(--success-bright))",
  },
  errorCount: {
    label: "error",
    color: "hsl(var(--destructive-bright))",
  },
};

export type IntervalUnit = "minute" | "hour" | "day";

export interface Interval {
  value: number;
  unit: IntervalUnit;
}

export const TICK_COUNT_BREAKPOINTS = [
  { minWidth: 1536, ticks: 16 }, // 2xl
  { minWidth: 1280, ticks: 12 }, // xl
  { minWidth: 1024, ticks: 12 }, // lg
  { minWidth: 768, ticks: 8 }, // md
  { minWidth: 640, ticks: 6 }, // sm
  { minWidth: 0, ticks: 4 }, // xs
] as const;

export const getTickCountForWidth = (width: number): number =>
  TICK_COUNT_BREAKPOINTS.find((bp) => width >= bp.minWidth)?.ticks ?? 4;

export const BAR_COUNT_BREAKPOINTS = [
  { minWidth: 1536, bars: 72 }, // 2xl
  { minWidth: 1280, bars: 64 }, // xl
  { minWidth: 1024, bars: 56 }, // lg
  { minWidth: 768, bars: 48 }, // md
  { minWidth: 640, bars: 40 }, // sm
  { minWidth: 0, bars: 24 }, // xs
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
    return { value: Math.round(intervalMinutes), unit: "minute" };
  } else if (intervalMinutes < 60 * 24) {
    const hours = intervalMinutes / 60;
    return { value: Math.round(hours), unit: "hour" };
  } else {
    const days = intervalMinutes / (60 * 24);
    return { value: Math.round(days), unit: "day" };
  }
}

export const normalizeTimeRange = (left: string, right: string) => {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  return leftTime > rightTime
    ? { start: right, end: left, startTime: rightTime, endTime: leftTime }
    : { start: left, end: right, startTime: leftTime, endTime: rightTime };
};

export const isValidZoomRange = (left: string | undefined, right: string | undefined, minHours: number = 1) => {
  if (!left || !right || left === right) return false;

  const normalized = normalizeTimeRange(left, right);
  const diffHours = differenceInHours(normalized.endTime, normalized.startTime);
  return diffHours >= minHours;
};
