"use client";

import { ColumnDef, Row } from "@tanstack/react-table";
import { Pen } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/datatable";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { Datapoint, Dataset as DatasetType } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import RenameDatasetDialog from "../datasets/rename-dataset-dialog";
import DownloadButton from "../ui/download-button";
import Header from "../ui/header";
import JsonTooltip from "../ui/json-tooltip";
import MonoWithCopy from "../ui/mono-with-copy";
import AddDatapointsDialog from "./add-datapoints-dialog";
import DatasetPanel from "./dataset-panel";
import DownloadParquetDialog from "./download-parquet-dialog";
import ManualAddDatapoint from "./manual-add-datapoint-dialog";

interface DatasetProps {
  dataset: DatasetType;
  enableDownloadParquet?: boolean;
  publicApiBaseUrl?: string;
}

const columns: ColumnDef<Datapoint>[] = [
  {
    accessorKey: "createdAt",
    header: "Created at",
    size: 150,
    cell: (row) => <ClientTimestampFormatter timestamp={String(`${row.getValue()}Z`)} />,
  },
  {
    accessorFn: (row) => row.data,
    header: "Data",
    size: 200,
  },
  {
    accessorFn: (row) => row.target,
    header: "Target",
    size: 200,
  },
  {
    accessorFn: (row) => row.metadata,
    header: "Metadata",
    size: 200,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
  },
];

export default function Dataset({ dataset, enableDownloadParquet, publicApiBaseUrl }: DatasetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId } = useParams();
  const [selectedDatapointIds, setSelectedDatapointIds] = useState<string[]>([]);
  const { toast } = useToast();

  const datapointId = searchParams.get("datapointId");
  const [selectedDatapoint, setSelectedDatapoint] = useState<Datapoint | null>(null);

  const parseNumericSearchParam = (key: string, defaultValue: number): number => {
    const param = searchParams.get(key);
    if (Array.isArray(param)) {
      return defaultValue;
    }
    const parsed = param ? parseInt(param as string) : defaultValue;
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const pageNumber = parseNumericSearchParam("pageNumber", 0);
  const pageSize = Math.max(parseNumericSearchParam("pageSize", 50), 1);

  const swrKey = `/api/projects/${projectId}/datasets/${dataset.id}/datapoints?pageNumber=${pageNumber}&pageSize=${pageSize}`;
  const { data, mutate } = useSWR<PaginatedResponse<Datapoint>>(swrKey, swrFetcher);

  const datapoints = data?.items;
  const totalCount = data?.totalCount || 0;
  const pageCount = Math.ceil(totalCount / pageSize);

  const handleDatapointSelect = useCallback(
    (datapoint: Row<Datapoint> | null) => {
      const params = new URLSearchParams(searchParams);
      if (datapoint) {
        setSelectedDatapoint(datapoint.original);
        params.set("datapointId", datapoint.id);
      } else {
        setSelectedDatapoint(null);
        params.delete("datapointId");
      }
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const handlePanelClose = useCallback(
    (updatedDatapoint?: Datapoint) => {
      if (updatedDatapoint) {
        mutate(
          (currentData: PaginatedResponse<Datapoint> | undefined) => {
            if (!currentData) return currentData;

            return {
              ...currentData,
              items: currentData.items.map((datapoint) =>
                datapoint.id === updatedDatapoint.id ? updatedDatapoint : datapoint
              ),
            };
          },
          {
            revalidate: false,
            populateCache: true,
          }
        );
      }

      handleDatapointSelect(null);
    },
    [mutate, handleDatapointSelect]
  );

  const handleDeleteDatapoints = useCallback(
    async (datapointIds: string[]) => {
      try {
        await mutate(
          async (currentData) => {
            const response = await fetch(
              `/api/projects/${projectId}/datasets/${dataset.id}/datapoints` +
                `?datapointIds=${datapointIds.join(",")}`,
              {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                },
              }
            );

            if (!response.ok) {
              throw new Error("Failed to delete datapoints");
            }

            if (!currentData) {
              return { items: [], totalCount: 0 };
            }

            return {
              items: currentData.items.filter((datapoint) => !datapointIds.includes(datapoint.id)),
              totalCount: currentData.totalCount - datapointIds.length,
            };
          },
          {
            optimisticData: (currentData) => {
              if (!currentData) {
                return { items: [], totalCount: 0 };
              }
              return {
                items: currentData.items.filter((datapoint) => !datapointIds.includes(datapoint.id)),
                totalCount: currentData.totalCount - datapointIds.length,
              };
            },
            rollbackOnError: true,
            revalidate: false,
          }
        );

        setSelectedDatapointIds([]);
        toast({
          title: "Datapoints deleted",
          description: `Successfully deleted ${datapointIds.length} datapoint(s).`,
        });

        if (selectedDatapoint && datapointIds.includes(selectedDatapoint.id)) {
          handleDatapointSelect(null);
        }
      } catch (error) {
        toast({
          title: "Failed to delete datapoints",
          variant: "destructive",
        });
      }
    },
    [dataset.id, handleDatapointSelect, mutate, projectId, selectedDatapoint, toast]
  );

  const revalidateDatapoints = useCallback(() => {
    mutate();
  }, [mutate]);

  const onPageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  useEffect(() => {
    if (datapointId && datapoints) {
      const datapoint = datapoints.find((d) => d.id === datapointId);
      if (datapoint) {
        setSelectedDatapoint(datapoint);
      }
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      <Header path={"datasets/" + dataset.name} />
      <div className="flex p-4 items-start sm:items-center space-x-4">
        <div>
          <h1 className="text-lg font-medium">{dataset.name}</h1>
          <MonoWithCopy className="text-secondary-foreground pt-1 text-nowrap truncate">{dataset.id}</MonoWithCopy>
        </div>
        <div className="flex flex-wrap flex-1 items-end justify-end gap-2">
          <RenameDatasetDialog dataset={dataset} />
          <DownloadButton
            uri={`/api/projects/${projectId}/datasets/${dataset.id}/download`}
            supportedFormats={["csv", "json"]}
            filenameFallback={`${dataset.name.replace(/[^a-zA-Z0-9-_\.]/g, "_")}-${dataset.id}`}
            variant="outline"
          />
          <AddDatapointsDialog datasetId={dataset.id} onUpdate={revalidateDatapoints} />
          <ManualAddDatapoint datasetId={dataset.id} onUpdate={revalidateDatapoints} />
          <div
            className={selectedDatapointIds.length === 0 ? "pointer-events-none" : ""}
            title={selectedDatapointIds.length === 0 ? "Select datapoints to add to labeling queue" : ""}
          >
            <AddToLabelingQueuePopover
              datasetId={dataset.id}
              datapointIds={
                selectedDatapointIds.length > 0 ? selectedDatapointIds : datapoints?.map(({ id }) => id) || []
              }
            >
              <Badge
                className={`cursor-pointer py-1 px-2 ${selectedDatapointIds.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                variant="secondary"
              >
                <Pen className="size-3 min-w-3" />
                <span className="ml-2 truncate flex-1">
                  {selectedDatapointIds.length > 0
                    ? `Add to labeling queue (${selectedDatapointIds.length})`
                    : "Add to labeling queue"}
                </span>
              </Badge>
            </AddToLabelingQueuePopover>
          </div>
          {enableDownloadParquet && (
            <DownloadParquetDialog datasetId={dataset.id} publicApiBaseUrl={publicApiBaseUrl} />
          )}
        </div>
      </div>
      <div className="grow">
        <DataTable
          columns={columns}
          data={datapoints}
          getRowId={(datapoint) => datapoint.id}
          onRowClick={handleDatapointSelect}
          paginated
          focusedRowId={datapointId}
          manualPagination
          pageCount={pageCount}
          defaultPageSize={pageSize}
          defaultPageNumber={pageNumber}
          onPageChange={onPageChange}
          totalItemsCount={totalCount}
          enableRowSelection
          selectedRowIds={selectedDatapointIds}
          onSelectedRowsChange={setSelectedDatapointIds}
          selectionPanel={(selectedRowIds) => (
            <div className="flex flex-col space-y-2">
              <DeleteSelectedRows
                selectedRowIds={selectedRowIds}
                onDelete={handleDeleteDatapoints}
                entityName="datapoints"
              />
            </div>
          )}
        />
      </div>
      {selectedDatapoint && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            enable={{
              left: true,
            }}
            defaultSize={{
              width: 800,
            }}
          >
            <div className="w-full h-full flex">
              <DatasetPanel datasetId={dataset.id} datapointId={selectedDatapoint.id} onClose={handlePanelClose} />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}
