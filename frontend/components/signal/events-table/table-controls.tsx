"use client";

import AdvancedSearch from "@/components/common/advanced-search";
import ClustersSection from "@/components/signal/clusters-section";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

interface EventsTableControlsProps {
  projectId: string;
  signalId: string;
  filterColumns: ColumnFilter[];
  columnLabels: { id: string; label: string }[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
  onRefresh: () => void;
}

export function EventsTableControls({
  projectId,
  signalId,
  filterColumns,
  columnLabels,
  filters: activeFilters,
  onFiltersChange,
  searchValue,
  onSearchChange,
  onRefresh,
}: EventsTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full h-full gap-2">
        <DataTableFilter columns={filterColumns} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={`signal-events:${signalId}`} />
        <DateRangeFilter />
        <RefreshButton onClick={onRefresh} variant="outline" />
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          filters={filterColumns}
          storageKey={`signal-events-${signalId}`}
          resource="signal-events"
          placeholder="Search events by payload, severity, trace id, and more..."
          className="w-full flex-1 mb-2"
        />
      </div>
      {/* The section owns the breadcrumb trail: it belongs under the icicle
          strip, which only exists inside the section. */}
      <ClustersSection className="mb-2" />
    </>
  );
}
