import { format } from "date-fns";

import { formatRuleValue } from "../utils";
import { type ChartRow, type ChartRule, SERIES_COLOR } from "./series";

interface ChartTooltipProps {
  rule: ChartRule;
  active?: boolean;
  payload?: readonly { payload?: ChartRow }[];
}

export default function ChartTooltip({ rule, active, payload }: ChartTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-surface-up px-2.5 py-1.5 text-xs shadow-md">
      <span className="text-muted-foreground">{format(row.at, "MMM d, HH:mm")}</span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: SERIES_COLOR }} />
        <span className="font-medium tabular-nums">
          {row.value == null ? "No data" : formatRuleValue(rule, row.value)}
        </span>
      </span>
    </div>
  );
}
