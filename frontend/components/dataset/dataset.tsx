"use client";

import { ColumnDef, Row, RowSelectionState } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useState } from "react";

import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import { Button } from "@/components/ui/button.tsx";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/datatable-store";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { Datapoint, Dataset as DatasetType } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, TIME_SECONDS_FORMAT } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import RenameDatasetDialog from "../datasets/rename-dataset-dialog";
import DownloadButton from "../ui/download-button";
import Header from "../ui/header";
import JsonTooltip from "../ui/json-tooltip";
import AddDatapointsDialog from "./add-datapoints-dialog";
import DatasetPanel from "./dataset-panel";
import DownloadParquetDialog from "./download-parquet-dialog";
import ManualAddDatapoint from "./manual-add-datapoint-dialog";

interface DatasetProps {
  dataset: DatasetType;
  enableDownloadParquet?: boolean;
  publicApiBaseUrl?: string;
}

const FETCH_SIZE = 50;

const columns: ColumnDef<Datapoint>[] = [
  {
    cell: ({ row }) => <div>{row.index + 1}</div>,
    header: "Index",
    size: 80,
  },
  {
    accessorKey: "createdAt",
    header: "Updated at",
    size: 150,
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
  },
  {
    accessorFn: (row) => row.data,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
    header: "Data",
    size: 200,
  },
  {
    accessorFn: (row) => row.target,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
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

const DatasetContent = ({ dataset, enableDownloadParquet, publicApiBaseUrl }: DatasetProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId } = useParams();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { toast } = useToast();
  const [totalCount, setTotalCount] = useState(0);

  const fetchCount = useCallback(async () => {
    const url = `/api/projects/${projectId}/datasets/${dataset.id}/count`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error("Failed to fetch count");
    }

    const data = await res.json();
    return data.totalCount;
  }, [projectId, dataset.id, toast]);

  useEffect(() => {
    fetchCount().then((count) => {
      setTotalCount(count);
    });
  }, [fetchCount]);

  const datapointId = searchParams.get("datapointId");
  const [selectedDatapoint, setSelectedDatapoint] = useState<Datapoint | null>(null);
  const [isEditingDatapoint, setIsEditingDatapoint] = useState(false);

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      try {
        const url = `/api/projects/${projectId}/datasets/${dataset.id}/datapoints?pageNumber=${pageNumber}&pageSize=${FETCH_SIZE}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = await res.json();
          throw new Error(text.error || "Failed to fetch datapoints");
        }

        const data = await res.json();
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load datapoints. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, dataset.id, toast]
  );

  const {
    data: datapoints,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    updateData,
  } = useInfiniteScroll<Datapoint>({
    fetchFn: fetchDatapoints,
    enabled: true,
    deps: [dataset.id],
  });

  const selectedDatapointIds = useMemo(() => Object.keys(rowSelection), [rowSelection]);

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

  const handleDatapointUpdate = useCallback(
    (updatedDatapoint: Datapoint) => {
      // Update the datapoint in the table in place
      updateData((currentData) =>
        currentData.map((datapoint) => (datapoint.id === updatedDatapoint.id ? updatedDatapoint : datapoint))
      );
    },
    [updateData]
  );

  const handlePanelClose = useCallback(
    () => {
      setIsEditingDatapoint(false);
      handleDatapointSelect(null);
    },
    [handleDatapointSelect]
  );

  const handleDeleteDatapoints = useCallback(
    async (datapointIds: string[]) => {
      try {
        const response = await fetch(`/api/projects/${projectId}/datasets/${dataset.id}/datapoints`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            datapointIds,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to delete datapoints");
        }

        updateData((currentData) => currentData.filter((datapoint) => !datapointIds.includes(datapoint.id)));

        setRowSelection({});
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
    [dataset.id, handleDatapointSelect, projectId, selectedDatapoint, toast, updateData]
  );

  const revalidateDatapoints = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (datapointId && datapoints) {
      const datapoint = datapoints.find((d) => d.id === datapointId);
      if (datapoint) {
        setSelectedDatapoint(datapoint);
      }
    }
  }, [datapointId, datapoints]);

  return (
    <>
      <Header path={"datasets/" + dataset.name} />
      <div className={cn("flex px-4 pb-4 flex-col gap-2 overflow-hidden flex-1", {
        "pointer-events-none opacity-60": isEditingDatapoint
      })}>
        <div className="flex flex-wrap items-end gap-2">
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
              <Button
                icon="pen"
                className={cn({ "opacity-50 cursor-not-allowed": selectedDatapointIds.length === 0 })}
                variant="secondary"
              >
                <span className="truncate flex-1">
                  {selectedDatapointIds.length > 0
                    ? `Add to labeling queue (${selectedDatapointIds.length})`
                    : "Add to labeling queue"}
                </span>
              </Button>
            </AddToLabelingQueuePopover>
          </div>
          {enableDownloadParquet && (
            <DownloadParquetDialog datasetId={dataset.id} publicApiBaseUrl={publicApiBaseUrl} />
          )}
        </div>
        <div className="flex overflow-hidden flex-1">
          <InfiniteDataTable
            columns={columns}
            data={datapoints}
            hasMore={hasMore}
            isFetching={isFetching}
            isLoading={isLoading}
            fetchNextPage={fetchNextPage}
            getRowId={(datapoint) => datapoint.id}
            onRowClick={handleDatapointSelect}
            focusedRowId={datapointId}
            enableRowSelection
            state={{
              rowSelection,
            }}
            onRowSelectionChange={setRowSelection}
            className="flex-1"
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
        <div className="flex text-secondary-foreground text-sm">
          {totalCount} datapoints
        </div>
      </div>

      {selectedDatapoint && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            enable={{
              left: true,
            }}
            defaultSize={{
              width: 1000,
            }}
          >
            <div className="w-full h-full flex">
              <DatasetPanel
                datasetId={dataset.id}
                datapointId={selectedDatapoint.id}
                onClose={handlePanelClose}
                onEditingStateChange={setIsEditingDatapoint}
                onDatapointUpdate={handleDatapointUpdate}
              />
            </div>
          </Resizable>
        </div>
      )}
    </>
  );
};

export default function Dataset(props: DatasetProps) {
  return (
    <DataTableStateProvider>
      <DatasetContent {...props} />
    </DataTableStateProvider>
  );
}
