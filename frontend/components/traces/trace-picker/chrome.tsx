"use client";

import AdvancedSearch from "@/components/common/advanced-search";
import { filters as traceFilters } from "@/components/traces/traces-table/columns";
import DateRangeFilter from "@/components/ui/date-range-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import { type Filter } from "@/lib/actions/common/filters";

interface TracePickerChromeProps {
  dateRange: { pastHours?: string; startDate?: string; endDate?: string };
  onDateRangeChange: (range: { pastHours?: string; startDate?: string; endDate?: string }) => void;
  onRefresh: () => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
}

export function TracePickerChrome({
  dateRange,
  onDateRangeChange,
  onRefresh,
  searchValue,
  onSearchChange,
}: TracePickerChromeProps) {
  return (
    <>
      <div className="flex gap-2 w-full items-center">
        <DateRangeFilter mode="state" value={dateRange} onChange={onDateRangeChange} />
        <RefreshButton onClick={onRefresh} variant="outline" />
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          filters={traceFilters}
          resource="traces"
          storageKey="traces"
          value={searchValue}
          onChange={({ filters: f, search }) => onSearchChange({ filters: f, search })}
          placeholder="Search traces..."
          className="w-full flex-1"
          options={{ disableHotKey: true }}
        />
      </div>
    </>
  );
}
