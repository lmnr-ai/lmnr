"use client";

import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
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
    header: "name",
    size: 300,
  },
  {
    accessorKey: "datapointsCount",
    header: "Datapoints Count",
    size: 300,
  },
  {
    header: "Created at",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
];

export const defaultDatasetsColumnOrder = ["__row_selection", "id", "name", "datapointsCount", "createdAt"];

const FETCH_SIZE = 50;

function DatasetsContent() {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const fetchDatasets = useCallback(
    async (pageNumber: number) => {
      try {
        const url = `/api/projects/${projectId}/datasets?pageNumber=${pageNumber}&pageSize=${FETCH_SIZE}`;
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
    [projectId, toast]
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
    deps: [projectId],
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
      <div className="flex px-4 pb-4 flex-col gap-2 overflow-hidden flex-1">
        <CreateDatasetDialog onUpdate={handleCreateDataset}>
          <Button icon="plus" className="w-fit">
            Dataset
          </Button>
        </CreateDatasetDialog>
        <div className="flex overflow-hidden flex-1">
          <InfiniteDataTable
            enableRowSelection={true}
            onRowClick={(row) => {
              router.push(`/project/${projectId}/datasets/${row.original.id}`);
            }}
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
            <ColumnsMenu lockedColumns={["__row_selection"]} />
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
