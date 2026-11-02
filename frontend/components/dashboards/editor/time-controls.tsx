"use client";

import DateRangeFilter from "@/components/ui/date-range-filter";
import { GroupByPeriodSelect } from "@/components/ui/group-by-period-select";
import { Label } from "@/components/ui/label.tsx";

/** The dashboard's URL-driven range pickers, so the editor shares the dashboard's time range. */
export default function TimeControls() {
  return (
    <div className="flex items-center gap-4">
      <div className="grid gap-1">
        <Label className="text-xs text-secondary-foreground/80">Time range</Label>
        <DateRangeFilter className="w-fit" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-secondary-foreground/80">Group by</Label>
        <GroupByPeriodSelect />
      </div>
    </div>
  );
}
