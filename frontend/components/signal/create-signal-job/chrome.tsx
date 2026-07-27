"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { ColumnsMenu } from "@/components/ui/columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import { type TraceRow } from "@/lib/traces/types";

interface CreateSignalJobChromeProps {
  columns: ColumnDef<TraceRow>[];
  dateRange: { pastHours?: string; startDate?: string; endDate?: string };
  onDateRangeChange: (range: { pastHours?: string; startDate?: string; endDate?: string }) => void;
  onRefresh: () => void;
}

export function CreateSignalJobChrome({
  columns,
  dateRange,
  onDateRangeChange,
  onRefresh,
}: CreateSignalJobChromeProps) {
  return (
    <div className="flex gap-2">
      <ColumnsMenu
        columnLabels={columns.map((column) => ({
          id: column.id!,
          label: typeof column.header === "string" ? column.header : column.id!,
        }))}
      />
      <DateRangeFilter mode="state" value={dateRange} onChange={onDateRangeChange} />
      <RefreshButton onClick={onRefresh} variant="outline" />
    </div>
  );
}
