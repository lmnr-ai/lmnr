"use client";

import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { DatasetInfo } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

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

export default function Datasets() {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const swrKey = `/api/projects/${projectId}/datasets?pageNumber=0&pageSize=10000`;
  const { data, mutate } = useSWR<PaginatedResponse<DatasetInfo>>(swrKey, swrFetcher);

  const datasets = data?.items;

  const handleDeleteDatasets = async (datasetIds: string[]) => {
    try {
      await mutate(
        async (currentData) => {
          const res = await fetch(`/api/projects/${projectId}/datasets?datasetIds=${datasetIds.join(",")}`, {
            method: "DELETE",
          });

          if (!res.ok) {
            throw new Error("Failed to delete datasets");
          }

          if (!currentData) {
            return { items: [], totalCount: 0 };
          }

          return {
            items: currentData.items.filter((dataset) => !datasetIds.includes(dataset.id)),
            totalCount: currentData.totalCount - datasetIds.length,
          };
        },
        {
          optimisticData: (currentData) => {
            if (!currentData) {
              return { items: [], totalCount: 0 };
            }
            return {
              items: currentData.items.filter((dataset) => !datasetIds.includes(dataset.id)),
              totalCount: currentData.totalCount - datasetIds.length,
            };
          },
          rollbackOnError: true,
          revalidate: false,
        }
      );

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
  };

  return (
    <>
      <Header path="datasets" />
      <div className="flex flex-col gap-4 px-4 pb-4">
        <CreateDatasetDialog>
          <Button icon="plus" className="w-fit">
            Dataset
          </Button>
        </CreateDatasetDialog>
        <InfiniteDataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/datasets/${row.original.id}`);
          }}
          getRowId={(row: DatasetInfo) => row.id}
          columns={columns}
          data={datasets ?? []}
          hasMore={false}
          isFetching={false}
          isLoading={!data}
          fetchNextPage={() => {}}
          state={{
            rowSelection,
          }}
          onRowSelectionChange={setRowSelection}
          selectionPanel={(selectedRowIds) => (
            <div className="flex flex-col space-y-2">
              <DeleteSelectedRows
                selectedRowIds={selectedRowIds}
                onDelete={handleDeleteDatasets}
                entityName="datasets"
              />
            </div>
          )}
        />
      </div>
    </>
  );
}
