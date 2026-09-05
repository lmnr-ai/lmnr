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
      {/* The one child of the 70vh top part that stretches: everything around it
          is fixed-height, so this soaks up the slack and the table starts right
          at the fold instead of after a band of empty space. The section owns the
          breadcrumb trail — it belongs under the icicle strip, which only exists
          inside the section. */}
      <div className="flex min-h-0 w-full flex-1 flex-col pb-2">
        <ClustersSection className="min-h-0 flex-1" />
      </div>
      {/* No `flex-1`/`h-full` here: the parent is a flex COLUMN, so those would
          grow this row vertically and swallow the fixed 70vh above it. */}
      <div className="flex w-full shrink-0 gap-2">
        <DataTableFilter columns={filterColumns} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={`signal-events:${signalId}`} />
        {/* Refreshes the clusters and the run stats as well as the rows, so it
            does more than its neighbours here suggest. It stays with them
            because it is the table's control in every other respect. */}
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
