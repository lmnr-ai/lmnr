import { cn } from "@/lib/utils";

import { CHART_RANGE_KEYS, type ChartRange } from "../metric-alerts/constants";

interface RangePickerProps {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}

/** How far back the alert's chart looks. */
export default function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <div role="radiogroup" aria-label="Chart range" className="flex items-center rounded-md border p-0.5">
      {CHART_RANGE_KEYS.map((range) => (
        <button
          key={range}
          type="button"
          role="radio"
          aria-checked={range === value}
          onClick={() => onChange(range)}
          className={cn(
            "rounded px-2 py-0.5 text-xs tabular-nums transition-colors hover:text-foreground",
            range === value ? "bg-secondary font-medium text-foreground" : "text-muted-foreground"
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
