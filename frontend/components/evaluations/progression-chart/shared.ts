import { spacedPalette } from "@/lib/colors";

import { type ChartConfig } from "../../ui/chart";

export interface ProgressionPoint {
  timestamp: string;
  evaluationId: string;
  name: string;
  values: Record<string, number | null>;
}

/**
 * Score name → color. Single source for the chart lines, the legend AND the
 * table's score-column header dots, so a score reads as the same color in all
 * three. Pass a STABLY ORDERED name list (sorted) — position picks the color.
 */
export function scoreChartConfig(scoreNames: string[]): ChartConfig {
  const colors = spacedPalette(scoreNames.length);
  return Object.fromEntries(scoreNames.map((name, i) => [name, { color: colors[i], label: name }]));
}
