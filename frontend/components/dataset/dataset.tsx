"use client";

import { ColumnDef, Row } from "@tanstack/react-table";
import { get } from "lodash";
import { Pen } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import DownloadButton from "../ui/download-button";
import Header from "../ui/header";
import MonoWithCopy from "../ui/mono-with-copy";
import AddDatapointsDialog from "./add-datapoints-dialog";
import DatasetPanel from "./dataset-panel";
import ManualAddDatapoint from "./manual-add-datapoint-dialog";

interface DatasetProps {
  dataset: DatasetType;
}

const columns: ColumnDef<Datapoint>[] = [
  {
    accessorKey: "createdAt",
    header: "Created at",
    size: 150,
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
  {
    accessorFn: (row) => JSON.stringify(row.data),
    header: "Data",
    size: 200,
  },
  {
    accessorFn: (row) => (row.target ? JSON.stringify(row.target) : "-"),
    header: "Target",
    size: 200,
  },
  {
    accessorFn: (row) => (row.metadata ? JSON.stringify(row.metadata) : "-"),
    header: "Metadata",
    size: 200,
  },
];

const tryParse = (obj: any, key: string) => {
  try {
    const value = get(obj, key);
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return get(obj, key);
  }
};

export default function Dataset({ dataset }: DatasetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId } = useParams();
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

  const { data, mutate } = useSWR<PaginatedResponse<Datapoint>>(
    `/api/projects/${projectId}/datasets/${dataset.id}/datapoints` + `?pageNumber=${pageNumber}&pageSize=${pageSize}`,
    swrFetcher
  );

  const { datapoints, totalCount } = useMemo<{ datapoints: Datapoint[]; totalCount: number }>(
    () => ({
      datapoints: data?.items || [],
      totalCount: data?.totalCount || 0,
    }),
    [data?.items, data?.totalCount]
  );

  const datapointsToLabel = useMemo(
    () =>
      datapoints.map((point, index) => ({
        createdAt: new Date(Date.now() + index).toISOString(),
        payload: {
          data: tryParse(point, "data"),
          target: tryParse(point, "target"),
          metadata: tryParse(point, "metadata"),
        },
        metadata: { source: "datapoint", id: point.id },
      })),
    [datapoints]
  );

  const pageCount = Math.ceil(totalCount / pageSize);

  const handleDatapointSelect = useCallback(
    (datapoint: Row<Datapoint> | null) => {
      const params = new URLSearchParams(searchParams);
      if (datapoint) {
        setSelectedDatapoint(datapoint.original);
        params.set("datapointId", datapoint.id);
      } else {
        setSelectedDatapoint(datapoint);
        params.delete("datapointId");
      }
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const handleDeleteDatapoints = useCallback(
    async (datapointIds: string[]) => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/datasets/${dataset.id}/datapoints` + `?datapointIds=${datapointIds.join(",")}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        if (!response.ok) {
          toast({
            title: "Failed to delete datapoints",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Datapoints deleted",
            description: `Successfully deleted ${datapointIds.length} datapoint(s).`,
          });
          mutate();
        }

        if (selectedDatapoint && datapointIds.includes(selectedDatapoint.id)) {
          handleDatapointSelect(null);
        }
      } catch (e) {
        toast({
          title: "Failed to delete datapoints",
          variant: "destructive",
        });
      }
    },
    [dataset.id, handleDatapointSelect, mutate, projectId, selectedDatapoint, toast]
  );

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
  }, [datapointId, datapoints]);

  return (
    <div className="h-full flex flex-col">
      <Header path={"datasets/" + dataset.name} />
      <div className="flex p-4 items-start sm:items-center space-x-4">
        <div>
          <h1 className="text-lg font-medium">{dataset.name}</h1>
          <MonoWithCopy className="text-secondary-foreground pt-1 text-nowrap truncate">{dataset.id}</MonoWithCopy>
        </div>
        <div className="flex flex-wrap flex-1 items-end justify-end gap-2">
          <DownloadButton
            uri={`/api/projects/${projectId}/datasets/${dataset.id}/download`}
            supportedFormats={["csv", "json"]}
            filenameFallback={`${dataset.name.replace(/[^a-zA-Z0-9-_\.]/g, "_")}-${dataset.id}`}
            variant="outline"
          />
          <AddDatapointsDialog datasetId={dataset.id} onUpdate={mutate} />
          <ManualAddDatapoint datasetId={dataset.id} onUpdate={mutate} />
          <AddToLabelingQueuePopover data={datapointsToLabel}>
            <Badge className="cursor-pointer py-1 px-2" variant="secondary">
              <Pen className="size-3 min-w-3" />
              <span className="ml-2 truncate flex-1">Add all to labeling queue</span>
            </Badge>
          </AddToLabelingQueuePopover>
        </div>
      </div>
      <div className="flex-grow">
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
              top: false,
              right: false,
              bottom: false,
              left: true,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            defaultSize={{
              width: 800,
            }}
          >
            <div className="w-full h-full flex">
              <DatasetPanel
                datasetId={dataset.id}
                datapointId={selectedDatapoint.id}
                onClose={() => {
                  handleDatapointSelect(null);
                  mutate();
                }}
              />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}
