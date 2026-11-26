import { LEVEL_COLORS, SERIES_COLOR, type ThresholdLine } from "./series";

interface ThresholdLegendProps {
  lines: ThresholdLine[];
  /** A budget chart also draws where the month is heading. */
  hasProjection: boolean;
}

/** Names the dashed lines under the chart, where close thresholds cannot overlap. */
export default function ThresholdLegend({ lines, hasProjection }: ThresholdLegendProps) {
  const entries = [
    ...lines.map((line) => ({
      label: line.label,
      color: LEVEL_COLORS[line.key],
      style: line.key === "resolve" ? "dotted" : "dashed",
    })),
    ...(hasProjection ? [{ label: "Projected for the month", color: SERIES_COLOR, style: "dashed" }] : []),
  ];
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary-foreground">
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5">
          <span className="w-4 border-t-2" style={{ borderColor: entry.color, borderStyle: entry.style }} />
          <span className="tabular-nums">{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}
