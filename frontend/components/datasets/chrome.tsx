"use client";

import AdvancedSearch from "@/components/common/advanced-search";
import { datasetsTableFilters, RESOURCE } from "@/components/datasets/constants";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

interface DatasetsChromeProps {
  projectId: string;
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
  columnLabels: { id: string; label: string }[];
}

export function DatasetsChrome({
  projectId,
  filters: activeFilters,
  onFiltersChange,
  searchValue,
  onSearchChange,
  columnLabels,
}: DatasetsChromeProps) {
  return (
    <>
      <div className="flex flex-1 w-full h-full space-x-2 pt-1">
        <DataTableFilter columns={datasetsTableFilters} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
      </div>
      <div className="w-full">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          storageKey={`datasets-${projectId}`}
          filters={datasetsTableFilters}
          placeholder="Search by dataset name..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
