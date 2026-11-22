"use client";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

import { columnLabels, RESOURCE, searchFilters } from "./constants";

interface EvalDatasetsTableControlsProps {
  projectId: string;
  onFiltersChange: (filters: Filter[]) => void;
  searchValue: AdvancedSearchValue;
  onSearchChange: (value: AdvancedSearchValue) => void;
}

export function EvalDatasetsTableControls({
  projectId,
  onFiltersChange,
  searchValue,
  onSearchChange,
}: EvalDatasetsTableControlsProps) {
  return (
    <>
      <div className="flex w-full flex-1 space-x-2 pt-1">
        <DataTableFilter columns={searchFilters} filters={searchValue.filters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
      </div>
      <div className="w-full">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          filters={searchFilters}
          placeholder="Search datasets by name..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
