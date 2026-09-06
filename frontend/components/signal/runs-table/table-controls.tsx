"use client";

import { type RefObject } from "react";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import RunsChart from "@/components/signal/runs-table/chart";
import { RESOURCE } from "@/components/signal/runs-table/constants";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

interface RunsTableControlsProps {
  projectId: string;
  filterColumns: ColumnFilter[];
  columnLabels: { id: string; label: string }[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  searchValue: AdvancedSearchValue;
  onSearchChange: (value: AdvancedSearchValue) => void;
  onRefresh: () => void;
  chartContainerRef: RefObject<HTMLDivElement | null>;
  chartContainerWidth: number | null;
  statsUrl: string | null;
}

export function RunsTableControls({
  projectId,
  filterColumns,
  columnLabels,
  filters,
  onFiltersChange,
  searchValue,
  onSearchChange,
  onRefresh,
  chartContainerRef,
  chartContainerWidth,
  statsUrl,
}: RunsTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full gap-2">
        <DataTableFilter columns={filterColumns} filters={filters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
        <DateRangeFilter />
        <RefreshButton onClick={onRefresh} variant="outline" />
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          filters={filterColumns}
          allowFreeTextSearch={false}
          uuidFilterColumn="run_id"
          storageKey={`signal-runs-${projectId}`}
          resource={RESOURCE}
          placeholder="Filter by status, run id, trace id…"
          className="w-full flex-1"
        />
      </div>
      <RunsChart
        className="w-full bg-secondary rounded border p-2"
        containerRef={chartContainerRef}
        containerWidth={chartContainerWidth}
        statsUrl={statsUrl}
      />
    </>
  );
}
