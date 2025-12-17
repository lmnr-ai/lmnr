"use client";

import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import { DatasetInfo } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import Header from "../ui/header";
import { InfiniteDataTable } from "../ui/infinite-datatable";
import Mono from "../ui/mono";
import CreateDatasetDialog from "./create-dataset-dialog";

const columns: ColumnDef<DatasetInfo>[] = [
  {
    cell: ({ row }) => <Mono>{row.original.id}</Mono>,
    size: 300,
    header: "ID",
    id: "id",
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 300,
    id: "name",
  },
  {
    accessorKey: "datapointsCount",
    header: "Datapoints Count",
    size: 300,
    id: "datapointsCount",
  },
  {
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "createdAt",
  },
];

const defaultDatasetsColumnOrder = ["__row_selection", "id", "name", "datapointsCount", "createdAt"];

const datasetsTableFilters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
  {
    name: "Datapoints count",
    key: "count",
    dataType: "number",
  },
];

const FETCH_SIZE = 50;

function DatasetsContent() {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const filter = searchParams.getAll("filter");
  const search = searchParams.get("search");

  const fetchDatasets = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        const url = `/api/projects/${projectId}/datasets?${urlParams.toString()}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = await res.json();
          throw new Error(text.error || "Failed to fetch datasets");
        }

        const data = await res.json();
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load datasets. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, toast, filter, search]
  );

  const {
    data: datasets,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<DatasetInfo>({
    fetchFn: fetchDatasets,
    enabled: true,
    deps: [projectId, filter, search],
  });

  const handleCreateDataset = useCallback(
    (newDataset: DatasetInfo) => {
      updateData((currentData) => [newDataset, ...currentData]);
    },
    [updateData]
  );

  const handleDeleteDatasets = useCallback(
    async (datasetIds: string[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/datasets?datasetIds=${datasetIds.join(",")}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          throw new Error("Failed to delete datasets");
        }

        updateData((currentData) => currentData.filter((dataset) => !datasetIds.includes(dataset.id)));

        setRowSelection({});
        toast({
          title: "Datasets deleted",
          description: `Successfully deleted ${datasetIds.length} dataset(s).`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete datasets. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, toast, updateData]
  );

  return (
    <>
      <Header path="datasets" />
      <div className="flex px-4 pb-4 flex-col gap-4 overflow-hidden flex-1">
        <CreateDatasetDialog onUpdate={handleCreateDataset}>
          <Button icon="plus" className="w-fit">
            Dataset
          </Button>
        </CreateDatasetDialog>
        <div className="flex overflow-hidden flex-1">
          <InfiniteDataTable
            enableRowSelection={true}
            getRowHref={(row) => `/project/${projectId}/datasets/${row.original.id}`}
            getRowId={(row: DatasetInfo) => row.id}
            columns={columns}
            data={datasets}
            hasMore={hasMore}
            isFetching={isFetching}
            isLoading={isLoading}
            fetchNextPage={fetchNextPage}
            state={{
              rowSelection,
            }}
            onRowSelectionChange={setRowSelection}
            lockedColumns={["__row_selection"]}
            selectionPanel={(selectedRowIds) => (
              <div className="flex flex-col space-y-2">
                <DeleteSelectedRows
                  selectedRowIds={selectedRowIds}
                  onDelete={handleDeleteDatasets}
                  entityName="datasets"
                />
              </div>
            )}
          >
            <div className="flex flex-1 w-full space-x-2 pt-1">
              <DataTableFilter columns={datasetsTableFilters} />
              <ColumnsMenu
                lockedColumns={["__row_selection"]}
                columnLabels={columns.map((column) => ({
                  id: column.id!,
                  label: typeof column.header === "string" ? column.header : column.id!,
                }))}
              />
              <DataTableSearch className="mr-0.5" placeholder="Search by dataset name..." />
            </div>
            <DataTableFilterList />
          </InfiniteDataTable>
        </div>
      </div>
    </>
  );
}

export default function Datasets() {
  return (
    <DataTableStateProvider storageKey="datasets-table" defaultColumnOrder={defaultDatasetsColumnOrder}>
      <DatasetsContent />
    </DataTableStateProvider>
  );
}
