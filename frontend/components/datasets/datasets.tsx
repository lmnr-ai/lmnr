"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { DatasetsChrome } from "@/components/datasets/chrome";
import { datasetsColumnLabels, DatasetsGrid } from "@/components/datasets/grid";
import { Button } from "@/components/ui/button";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type DatasetInfo } from "@/lib/dataset/types";
import { track } from "@/lib/posthog";

import Header from "../ui/header";
import { RESOURCE } from "./constants";
import CreateDatasetDialog from "./create-dataset-dialog";

const defaultDatasetsColumnOrder = ["__row_selection", "id", "name", "datapointsCount", "createdAt"];

function DatasetsContent() {
  const { projectId } = useParams();
  const updateDataRef = useRef<((fn: (data: DatasetInfo[]) => DatasetInfo[]) => void) | null>(null);

  useEffect(() => {
    track("datasets", "page_viewed");
  }, []);

  const { effective, isLoading: isViewLoading, setSearchAndFilters, setFilters } = useTableView();
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;

  const handleCreateDataset = (newDataset: DatasetInfo) => {
    updateDataRef.current?.((currentData) => [newDataset, ...currentData]);
  };

  const chrome = (
    <DatasetsChrome
      projectId={String(projectId)}
      filters={effective.filters}
      onFiltersChange={setFilters}
      searchValue={searchValue}
      onSearchChange={setSearchAndFilters}
      columnLabels={datasetsColumnLabels}
    />
  );

  return (
    <>
      <Header path="datasets" />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 overflow-hidden">
        <CreateDatasetDialog onUpdate={handleCreateDataset}>
          <Button icon="plus" className="w-fit">
            Dataset
          </Button>
        </CreateDatasetDialog>
        <div className="flex flex-1 overflow-hidden">
          <DatasetsGrid
            chrome={chrome}
            updateDataRef={updateDataRef}
            filter={filter}
            search={search}
            isViewLoading={isViewLoading}
          />
        </div>
      </div>
    </>
  );
}

export default function Datasets() {
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultDatasetsColumnOrder }}
      lockedColumns={["__row_selection"]}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <DatasetsContent />
    </InfiniteDataTableProvider>
  );
}
