"use client";

import { type ColumnDef } from "@tanstack/react-table";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import DatasetColumnsMenu from "@/components/dataset/dataset-columns-menu";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Datapoint } from "@/lib/dataset/types";

const RESOURCE = "dataset";

interface DatasetChromeProps {
  projectId: string;
  datasetId: string;
  columnLabels: { id: string; label: string; onDelete?: () => void }[];
  columnDefs: ColumnDef<Datapoint>[];
  allFilters: ColumnFilter[];
  searchValue: AdvancedSearchValue;
  onSearchChange: (value: AdvancedSearchValue) => void;
}

export function DatasetChrome({
  projectId,
  datasetId,
  columnLabels,
  columnDefs,
  allFilters,
  searchValue,
  onSearchChange,
}: DatasetChromeProps) {
  return (
    <>
      <div className="flex flex-1 w-full space-x-2">
        <DatasetColumnsMenu columnLabels={columnLabels} columnDefs={columnDefs} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          filters={allFilters}
          value={searchValue}
          onChange={onSearchChange}
          storageKey={`dataset-${datasetId}`}
          placeholder="Filter by id, metadata, data, target..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
