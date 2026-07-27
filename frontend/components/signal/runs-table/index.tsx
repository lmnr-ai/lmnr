"use client";

import { isEqual } from "lodash";
import { useCallback, useRef, useState } from "react";

import { RunsTableChrome } from "@/components/signal/runs-table/chrome";
import { RunsTableGrid } from "@/components/signal/runs-table/grid";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type Filter } from "@/lib/actions/common/filters";

import { defaultRunsColumnOrder, getSignalRunsColumns, signalRunsFilters } from "./columns";

function RunsTableContent() {
  const refetchRef = useRef<() => void>(() => {});
  const [filters, setFilters] = useState<Filter[]>([]);
  const [dateRange, setDateRange] = useState<{ pastHours?: string; startDate?: string; endDate?: string }>({
    pastHours: "24",
  });

  const columns = getSignalRunsColumns();

  const handleAddFilter = useCallback((filter: Filter) => {
    setFilters((prev) => [...prev, filter]);
  }, []);

  const handleRemoveFilter = useCallback((filter: Filter) => {
    setFilters((prev) => prev.filter((f) => !isEqual(f, filter)));
  }, []);

  const handleRefresh = useCallback(() => {
    refetchRef.current();
  }, []);

  const chrome = (
    <RunsTableChrome
      filterColumns={signalRunsFilters}
      columnLabels={columns.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
      }))}
      filters={filters}
      onAddFilter={handleAddFilter}
      onRemoveFilter={handleRemoveFilter}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onRefresh={handleRefresh}
    />
  );

  return (
    <div className="flex flex-col gap-2 flex-1 overflow-hidden">
      <RunsTableGrid chrome={chrome} refetchRef={refetchRef} filters={filters} dateRange={dateRange} />
    </div>
  );
}

export default function SignalRunsTable() {
  return (
    <InfiniteDataTableProvider uniqueKey="runId" defaults={{ columnOrder: defaultRunsColumnOrder }}>
      <RunsTableContent />
    </InfiniteDataTableProvider>
  );
}
