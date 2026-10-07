"use client";

import AdvancedSearch from "@/components/common/advanced-search";
import ClustersSection from "@/components/signal/clusters-section";
import { ColumnsMenu } from "@/components/ui/columns-menu";
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
    // Order matters and is the point: the cluster navigation and the chart come
    // first, then the table's own controls, then the rows. Everything left in
    // here is TABLE-scoped, so it sits directly above the table; the time range
    // is page-scoped and lives up beside the tabs.
    <>
      <ClustersSection className="pb-2" />
      <div className="flex w-full shrink-0 gap-2">
        <DataTableFilter columns={filterColumns} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={`signal-events:${signalId}`} />
        {/* Refreshes the clusters and chart stats as well as the rows. */}
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
    </>
  );
}
