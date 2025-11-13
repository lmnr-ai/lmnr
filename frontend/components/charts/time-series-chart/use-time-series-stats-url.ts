import { useMemo } from "react";

import { calculateOptimalInterval, getTargetBarsForWidth, Interval } from "./utils";

interface UseTimeSeriesStatsUrlOptions {
  baseUrl: string;
  chartContainerWidth: number | null;
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  filters?: string[];
  additionalParams?: Record<string, string | string[]>;
  defaultTargetBars?: number;
}

export function useTimeSeriesStatsUrl({
  baseUrl,
  chartContainerWidth,
  pastHours,
  startDate,
  endDate,
  filters = [],
  additionalParams = {},
  defaultTargetBars = 24,
}: UseTimeSeriesStatsUrlOptions): string | null {
  const interval = useMemo((): Interval => {
    const targetBars = chartContainerWidth
      ? getTargetBarsForWidth(chartContainerWidth)
      : defaultTargetBars;

    let range: { start: Date; end: Date } | null = null;

    if (pastHours && pastHours !== "all") {
      const hours = parseInt(pastHours);
      if (!isNaN(hours)) {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
        range = { start, end };
      }
    } else if (startDate && endDate) {
      range = { start: new Date(startDate), end: new Date(endDate) };
    }

    if (!range) {
      return { value: 1, unit: "hour" as const };
    }

    return calculateOptimalInterval(range.start, range.end, targetBars);
  }, [chartContainerWidth, startDate, endDate, pastHours, defaultTargetBars]);

  return useMemo(() => {
    const shouldFetch = !!(pastHours || (startDate && endDate));

    if (!shouldFetch || !chartContainerWidth) {
      return null;
    }

    const urlParams = new URLSearchParams();

    if (pastHours) urlParams.set("pastHours", pastHours);
    if (startDate) urlParams.set("startDate", startDate);
    if (endDate) urlParams.set("endDate", endDate);

    urlParams.set("intervalValue", interval.value.toString());
    urlParams.set("intervalUnit", interval.unit);

    filters.forEach((f) => urlParams.append("filter", f));

    Object.entries(additionalParams).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => urlParams.append(key, v));
      } else if (value) {
        urlParams.set(key, value);
      }
    });

    return `${baseUrl}?${urlParams.toString()}`;
  }, [
    baseUrl,
    chartContainerWidth,
    pastHours,
    startDate,
    endDate,
    interval.value,
    interval.unit,
    filters,
    additionalParams,
  ]);
}

