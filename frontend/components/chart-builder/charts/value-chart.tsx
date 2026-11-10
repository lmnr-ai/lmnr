import { type ColumnInfo } from "@/components/chart-builder/utils";
import { cn } from "@/lib/utils";

import ChartEmptyState from "./chart-empty-state";
import { formatSingleValue } from "./format-value";
import { fitText, useFitBox } from "./use-fit-text";

const LINE_HEIGHT = 1.25;
const FIT = { minSize: 14, maxSize: 120, lineHeight: LINE_HEIGHT, fill: 0.75 };
// Below this a full number reads poorly, so it switches to compact ("$2.5M"), as Metabase's scalar does.
const COMPACT_BELOW_PX = 32;

interface ValueChartProps {
  data: Record<string, unknown>[];
  columns: ColumnInfo[];
  column?: string;
  hiddenColumns?: string[];
}

/** One cell of the first row, sized to fill the card: a big number, or text when the query returns one. */
const ValueChart = ({ data, columns, column, hiddenColumns }: ValueChartProps) => {
  const { ref, box } = useFitBox<HTMLDivElement>();
  const name =
    column && columns.some((col) => col.name === column)
      ? column
      : columns.find((col) => !hiddenColumns?.includes(col.name))?.name;

  if (data.length === 0 || !name) {
    return <ChartEmptyState title="No data during this period" />;
  }

  const raw = data[0][name];
  const full = formatSingleValue(raw, name);
  const maxLines = full.kind === "text" ? 3 : 1;
  let value = full;
  let fit = box && fitText(full.text, box, { ...FIT, maxLines });
  if (box && fit && full.kind === "number" && fit.size < COMPACT_BELOW_PX) {
    const compact = formatSingleValue(raw, name, true);
    if (compact.text !== full.text) {
      value = compact;
      fit = fitText(compact.text, box, { ...FIT, maxLines });
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1 px-2">
      {/* The measured box; it carries the value's font so measurement matches what renders. */}
      <div
        ref={ref}
        className={cn(
          "flex min-h-0 w-full flex-1 items-center justify-center font-medium",
          full.kind === "number" && "tabular-nums"
        )}
      >
        <span
          title={typeof raw === "object" || value !== full ? full.text : String(raw)}
          style={fit ? { fontSize: fit.size, lineHeight: LINE_HEIGHT } : { visibility: "hidden" }}
          className={cn(
            "max-w-full text-center",
            fit && fit.lines > 1 ? "line-clamp-3 break-words" : "truncate",
            value.kind === "empty" && "text-muted-foreground"
          )}
        >
          {value.text}
        </span>
      </div>
      {data.length > 1 && (
        <span className="text-xs text-muted-foreground">First of {data.length.toLocaleString()} rows</span>
      )}
    </div>
  );
};

export default ValueChart;
