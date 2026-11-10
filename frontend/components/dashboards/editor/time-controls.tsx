"use client";

import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { needsTimeSeries } from "@/components/dashboards/editor/utils";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { GroupByPeriodSelect } from "@/components/ui/group-by-period-select";

/** The dashboard's URL-driven range pickers, so the editor shares the dashboard's time range. */
export default function TimeControls() {
  // Only time series bucket by the interval; Advanced SQL may use {interval_unit} anywhere.
  const showGroupBy = useDashboardEditorStoreContext(
    (state) => state.editorMode === "sql" || needsTimeSeries(state.chart.settings.config.type)
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <DateRangeFilter className="min-w-0 [&>div]:min-w-0 [&>div>span]:truncate" />
      {showGroupBy && <GroupByPeriodSelect />}
    </div>
  );
}
