import { type ChartPoint } from "@tanstack/charts";

import { ElevatedSurface } from "@/components/ui/surface";

import { type SeriesRow } from "./definition";

// Past this many series, zero rows are noise rather than information (same rule as DashboardChartTooltipContent).
const MAX_ROWS_WITH_ZEROS = 6;

interface TooltipBodyProps {
  points: readonly ChartPoint<SeriesRow, string, number>[];
  formatX: (value: string) => string;
}

/** The dashboard tooltip: the focused x, then one row per series. */
const TooltipBody = ({ points, formatX }: TooltipBodyProps) => {
  const rows = points.length > MAX_ROWS_WITH_ZEROS ? points.filter((p) => p.datum.value !== 0) : points;
  if (!points.length) return null;

  return (
    <ElevatedSurface
      offset={3}
      className="grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
    >
      <div className="font-medium">{formatX(points[0].datum.x)}</div>
      <div className="grid gap-1.5">
        {rows.map((point) => (
          <div key={point.datum.series} className="flex w-full items-center gap-2">
            <div className="size-2.5 shrink-0 rounded-[2px]" style={{ background: point.color }} />
            <div className="flex flex-1 items-center justify-between gap-2 leading-none">
              <span className="text-muted-foreground">{point.datum.series}</span>
              <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
                {point.datum.value.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ElevatedSurface>
  );
};

export default TooltipBody;
