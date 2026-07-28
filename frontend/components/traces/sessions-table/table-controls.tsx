"use client";

import AdvancedSearch from "@/components/common/advanced-search";
import { columns, filters } from "@/components/traces/sessions-table/columns";
import { RESOURCE } from "@/components/traces/sessions-table/constants";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

interface SessionsTableControlsProps {
  projectId: string;
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  onRefresh: () => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
}

export function SessionsTableControls({
  projectId,
  filters: activeFilters,
  onFiltersChange,
  onRefresh,
  searchValue,
  onSearchChange,
}: SessionsTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full h-full gap-2">
        <DataTableFilter columns={filters} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu
          columnLabels={columns.map((column) => ({
            id: column.id!,
            label: typeof column.header === "string" ? column.header : column.id!,
          }))}
        />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
        <DateRangeFilter />
        <RefreshButton onClick={onRefresh} variant="outline" />
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          filters={filters}
          placeholder="Search by session ID, duration, cost, tokens and more..."
          className="w-full flex-1"
          storageKey={`sessions-${projectId}`}
          resource="sessions"
        />
      </div>
    </>
  );
}
