import { type ColumnInfo } from "@/components/chart-builder/utils";
import { cn } from "@/lib/utils";

import ChartEmptyState from "./chart-empty-state";
import { formatSingleValue } from "./format-value";

// Text up to this length reads like a stat ("gpt-4o", "ERROR") and gets the number's size.
const LARGE_TEXT_MAX = 16;

interface ValueChartProps {
  data: Record<string, unknown>[];
  columns: ColumnInfo[];
  column?: string;
  hiddenColumns?: string[];
}

/** One cell of the first row, sized to the card: a big number, or text when the query returns one. */
const ValueChart = ({ data, columns, column, hiddenColumns }: ValueChartProps) => {
  const name =
    column && columns.some((col) => col.name === column)
      ? column
      : columns.find((col) => !hiddenColumns?.includes(col.name))?.name;

  if (data.length === 0 || !name) {
    return <ChartEmptyState title="No data during this period" />;
  }

  const raw = data[0][name];
  const value = formatSingleValue(raw, name);
  const large = value.kind !== "text" || value.text.length <= LARGE_TEXT_MAX;

  return (
    // Size containment lets the value scale with both card dimensions (cqw/cqh).
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1 px-2 [container-type:size]">
      <span
        title={typeof raw === "object" ? value.text : String(raw)}
        className={cn(
          "max-w-full text-center font-medium",
          value.kind === "number" && "tabular-nums",
          large
            ? "truncate leading-none text-[clamp(1.5rem,min(16cqw,45cqh),5rem)]"
            : "line-clamp-3 break-words leading-tight text-[clamp(0.875rem,min(5cqw,14cqh),1.75rem)]",
          value.kind === "empty" && "text-muted-foreground"
        )}
      >
        {value.text}
      </span>
      {data.length > 1 && (
        <span className="text-xs text-muted-foreground">First of {data.length.toLocaleString()} rows</span>
      )}
    </div>
  );
};

export default ValueChart;
