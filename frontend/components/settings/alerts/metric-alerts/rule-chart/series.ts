import { type MetricRuleInput, type PreviewGroup } from "@/lib/actions/alerts/metric-rule";

import { formatRuleValue } from "../utils";

export type ChartRule = Pick<MetricRuleInput, "metric" | "condition" | "warning" | "critical" | "resolve">;

export interface ChartRow {
  at: number;
  value: number | null;
}

export interface ThresholdLine {
  key: "warning" | "critical" | "resolve";
  label: string;
  value: number;
}

export interface IncidentBand {
  from: number;
  to: number;
  critical: boolean;
}

export const SERIES_COLOR = "hsl(var(--chart-10))";
export const LEVEL_COLORS = {
  warning: "hsl(var(--chart-5))",
  critical: "hsl(var(--chart-4))",
  resolve: "var(--color-muted-foreground)",
} as const;

export const toRows = (group: PreviewGroup): ChartRow[] =>
  group.points.map((point) => ({ at: new Date(point.at).getTime(), value: point.value }));

/** The lines a rule draws across its chart. */
export const thresholdLines = (rule: ChartRule): ThresholdLine[] => {
  const lines: [ThresholdLine["key"], string, number | null | undefined][] = [
    ["critical", "Critical", rule.critical],
    ["warning", "Warning", rule.warning],
    ["resolve", "Resolve", rule.resolve],
  ];
  return lines.flatMap(([key, name, value]) =>
    value == null ? [] : [{ key, value, label: `${name} ${formatRuleValue(rule, value)}` }]
  );
};

const MIN_BAND_FRACTION = 200;

/**
 * One band per stretch an incident was open. An incident that resolved and
 * reopened is shaded only while it was open, not across the quiet time between.
 */
export const incidentBands = (group: PreviewGroup, rows: ChartRow[]): IncidentBand[] => {
  const end = rows.at(-1)?.at;
  if (end == null) return [];
  const bands: IncidentBand[] = [];
  for (const incident of group.incidents) {
    let open: IncidentBand | null = null;
    for (const transition of incident.transitions) {
      const at = new Date(transition.at).getTime();
      if (transition.kind === "resolved") {
        if (open) bands.push({ ...open, to: at });
        open = null;
      } else {
        open ??= { from: at, to: end, critical: false };
        open.critical ||= transition.level === "critical";
      }
    }
    if (open) bands.push(open);
  }
  // A short incident on a long chart would be thinner than a pixel.
  const minWidth = (end - rows[0].at) / MIN_BAND_FRACTION;
  return bands.map((band) => {
    const missing = minWidth - (band.to - band.from);
    return missing > 0 ? { ...band, from: band.from - missing / 2, to: band.to + missing / 2 } : band;
  });
};

/** Keeps every threshold in view, so a quiet series still shows how far it is from alerting. */
export const yDomain = (rows: ChartRow[], lines: ThresholdLine[]): [number, number] => {
  const values = [
    ...rows.map((row) => row.value).filter((value): value is number => value != null),
    ...lines.map((line) => line.value),
  ];
  const max = values.length > 0 ? Math.max(...values) : 1;
  const min = values.length > 0 ? Math.min(0, ...values) : 0;
  return [min, max === min ? min + 1 : max + (max - min) * 0.1];
};

/** The midnights between two times, so a chart of several days names each day once. */
export const dayTicks = (from: number, to: number): number[] => {
  const ticks: number[] = [];
  const day = new Date(from);
  day.setHours(24, 0, 0, 0);
  for (; day.getTime() <= to; day.setDate(day.getDate() + 1)) ticks.push(day.getTime());
  return ticks;
};
