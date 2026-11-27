import { LEVEL_COLORS, type ThresholdLine } from "./series";

/** Names the dashed lines under the chart, where close thresholds cannot overlap. */
export default function ThresholdLegend({ lines }: { lines: ThresholdLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary-foreground">
      {lines.map((line) => (
        <li key={line.key} className="flex items-center gap-1.5">
          <span
            className="w-4 border-t-2"
            style={{ borderColor: LEVEL_COLORS[line.key], borderStyle: line.key === "resolve" ? "dotted" : "dashed" }}
          />
          <span className="tabular-nums">{line.label}</span>
        </li>
      ))}
    </ul>
  );
}
