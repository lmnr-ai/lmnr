"use client";

import { type RefObject } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import TracesChart from "@/components/traces/traces-chart";
import { RESOURCE } from "@/components/traces/traces-table/constants";
import { TracesRealtimeToggle } from "@/components/traces/traces-table/realtime-toggle";
import TracesColumnsMenu from "@/components/traces/traces-table/traces-columns-menu";
import { type buildColumnDefs } from "@/components/traces/traces-table/traces-table-store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

interface TracesTableControlsProps {
  projectId: string;
  allFilters: ColumnFilter[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  columnLabels: {
    id: string;
    label: string;
    onDelete?: () => void;
  }[];
  columnDefs: ReturnType<typeof buildColumnDefs>;
  onRefresh: () => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
  chartContainerRef: RefObject<HTMLDivElement | null>;
}

export function TracesTableControls({
  projectId,
  allFilters,
  filters,
  onFiltersChange,
  columnLabels,
  columnDefs,
  onRefresh,
  searchValue,
  onSearchChange,
  chartContainerRef,
}: TracesTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full h-full gap-2">
        <DataTableFilter columns={allFilters} filters={filters} onFiltersChange={onFiltersChange} />
        <TracesColumnsMenu columnLabels={columnLabels} columnDefs={columnDefs} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
        <DateRangeFilter />
        <RefreshButton onClick={onRefresh} variant="outline" />
        <TracesRealtimeToggle />
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          filters={allFilters}
          storageKey={`traces-${projectId}`}
          resource="traces"
          placeholder="Search by root span name, tokens, tags, full text and more..."
          className="w-full flex-1"
        />
      </div>
      <TracesChart className="w-full bg-secondary rounded border p-2" containerRef={chartContainerRef} />
    </>
  );
}
