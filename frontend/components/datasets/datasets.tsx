"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { DatasetInfo } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { DataTable } from "../ui/datatable";
import Header from "../ui/header";
import Mono from "../ui/mono";
import { TableCell, TableRow } from "../ui/table";
import CreateDatasetDialog from "./create-dataset-dialog";

export default function Datasets() {
  const { projectId } = useParams();
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();

  const pageNumber = searchParams.get("pageNumber") ? parseInt(searchParams.get("pageNumber")!) : 0;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;

  const swrKey = `/api/projects/${projectId}/datasets?pageNumber=${pageNumber}&pageSize=${pageSize}`;
  const { data, isLoading } = useSWR<PaginatedResponse<DatasetInfo>>(swrKey, swrFetcher);

  const datasets = data?.items;
  const totalCount = data?.totalCount || 0;
  const pageCount = Math.ceil(totalCount / pageSize);

  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const handleDeleteDatasets = async (datasetIds: string[]) => {
    try {
      await mutate<PaginatedResponse<DatasetInfo>>(
        swrKey,
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

  return (
    <div className="h-full flex flex-col">
      <Header path="datasets" />
      <div className="flex justify-between items-center p-4 flex-none">
        <h1 className="scroll-m-20 text-2xl font-medium">Datasets</h1>
        <CreateDatasetDialog>
          <Button variant="outline">New dataset</Button>
        </CreateDatasetDialog>
      </div>
      <div className="flex-grow">
        <DataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/datasets/${row.original.id}`);
          }}
          getRowId={(row: DatasetInfo) => row.id}
          columns={columns}
          data={datasets}
          paginated
          manualPagination
          pageCount={pageCount}
          defaultPageSize={pageSize}
          defaultPageNumber={pageNumber}
          onPageChange={(pageNumber, pageSize) => {
            searchParams.set("pageNumber", pageNumber.toString());
            searchParams.set("pageSize", pageSize.toString());
            router.push(`${pathName}?${searchParams.toString()}`);
          }}
          totalItemsCount={totalCount}
          selectionPanel={(selectedRowIds) => (
            <div className="flex flex-col space-y-2">
              <DeleteSelectedRows
                selectedRowIds={selectedRowIds}
                onDelete={handleDeleteDatasets}
                entityName="datasets"
              />
            </div>
          )}
          emptyRow={
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text">
                Create a new dataset to get started
              </TableCell>
            </TableRow>
          }
        />
      </div>
    </div>
  );
}
