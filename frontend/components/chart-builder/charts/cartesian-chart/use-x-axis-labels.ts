import { useMemo } from "react";

import { createAxisFormatter, formatTooltipTimestamp, isTimeAxis } from "@/lib/charts/time";

export interface XAxisLabels {
  /** Round-time ticks come from the scale (`withTimeTicks`); otherwise every category is a candidate. */
  time: boolean;
  /** Category tick labels; time ticks are labelled by the scale that picked them. */
  formatTick: (value: string) => string;
  formatTooltip: (value: string) => string;
}

/** Tick and tooltip labels for the x axis, decided together so they can't drift apart. */
export const useXAxisLabels = (data: Record<string, unknown>[], x: string): XAxisLabels =>
  useMemo(() => {
    const format = createAxisFormatter(data, x);
    const time = isTimeAxis(data.map((row) => String(row[x])));
    return { time, formatTick: format, formatTooltip: time ? formatTooltipTimestamp : format };
  }, [data, x]);
