"use client";

import { ColumnsMenu } from "@/components/ui/columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import FilterPopover, { FilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter/ui";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { type Filter } from "@/lib/actions/common/filters";

interface RunsTableChromeProps {
  filterColumns: ColumnFilter[];
  columnLabels: { id: string; label: string }[];
  filters: Filter[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
  dateRange: { pastHours?: string; startDate?: string; endDate?: string };
  onDateRangeChange: (range: { pastHours?: string; startDate?: string; endDate?: string }) => void;
  onRefresh: () => void;
}

export function RunsTableChrome({
  filterColumns,
  columnLabels,
  filters,
  onAddFilter,
  onRemoveFilter,
  dateRange,
  onDateRangeChange,
  onRefresh,
}: RunsTableChromeProps) {
  return (
    <>
      <div className="flex flex-1 w-full space-x-2">
        <FilterPopover columns={filterColumns} filters={filters} onAddFilter={onAddFilter} />
        <ColumnsMenu columnLabels={columnLabels} />
        <DateRangeFilter mode="state" value={dateRange} onChange={onDateRangeChange} />
        <RefreshButton onClick={onRefresh} variant="outline" />
      </div>
      <FilterList className="py-[3px] text-xs px-1" filters={filters} onRemoveFilter={onRemoveFilter} />
    </>
  );
}
