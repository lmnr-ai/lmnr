"use client";

import AdvancedSearch from "@/components/common/advanced-search";
import { playgroundsTableFilters, RESOURCE } from "@/components/playgrounds/constants";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

interface PlaygroundsTableControlsProps {
  projectId: string;
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
  columnLabels: { id: string; label: string }[];
}

export function PlaygroundsTableControls({
  projectId,
  filters: activeFilters,
  onFiltersChange,
  searchValue,
  onSearchChange,
  columnLabels,
}: PlaygroundsTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full h-full space-x-2 pt-1">
        <DataTableFilter columns={playgroundsTableFilters} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
      </div>
      <div className="w-full">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          storageKey={`playgrounds-${projectId}`}
          filters={playgroundsTableFilters}
          placeholder="Search by playground name..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
