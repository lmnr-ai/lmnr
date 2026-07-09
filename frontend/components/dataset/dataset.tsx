"use client";

import { type ColumnDef, type Row, type RowSelectionState } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import { Button } from "@/components/ui/button.tsx";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useTableConfigStore, useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Datapoint, type Dataset as DatasetType } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import RenameDatasetDialog from "../datasets/rename-dataset-dialog";
import DownloadButton from "../ui/download-button";
import Header from "../ui/header";
import JsonTooltip from "../ui/json-tooltip";
import AddDatapointsDialog from "./add-datapoints-dialog";
import DatasetColumnsMenu from "./dataset-columns-menu";
import DatasetPanel from "./dataset-panel";
import { buildColumnDefs, buildFetchParams, datasetFilters } from "./dataset-table-store";
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
    id: "index",
  },
  {
    id: "id",
    accessorKey: "id",
    header: "ID",
    size: 300,
    cell: (row) => <span className="font-mono text-xs truncate">{String(row.getValue())}</span>,
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Updated",
    size: 150,
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
  },
  {
    accessorFn: (row) => row.data,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
    header: "Data",
    size: 200,
    id: "data",
  },
  {
    accessorFn: (row) => row.target,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
    header: "Target",
    size: 200,
    id: "target",
  },
  {
    accessorFn: (row) => row.metadata,
    header: "Metadata",
    size: 200,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
    id: "metadata",
  },
];

const defaultDatasetColumnOrder = ["__row_selection", "index", "id", "createdAt", "data", "target", "metadata"];
const RESOURCE = "dataset";

const DatasetContent = ({ dataset, enableDownloadParquet, publicApiBaseUrl }: DatasetProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId } = useParams();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { toast } = useToast();
  const [totalCount, setTotalCount] = useState(0);

  const { effective, setFilters } = useTableView();
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);

  // Filters-only: the free-text `search` half of AdvancedSearch is intentionally
  // dropped (datasets have no full-text search), so only filter tags drive the query.
  const searchValue = useMemo<AdvancedSearchValue>(
    () => ({ filters: effective.filters, search: "" }),
    [effective.filters]
  );
  const handleSearchChange = useCallback((next: AdvancedSearchValue) => setFilters(next.filters), [setFilters]);

  const { customColumns, removeCustomColumn } = useTableConfigStore(
    (s) => ({
      customColumns: s.config.customColumns,
      removeCustomColumn: s.removeCustomColumn,
    }),
    shallow
  );

  const columnDefs = useMemo(() => buildColumnDefs(columns, customColumns), [customColumns]);
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const allFilters = useMemo(() => {
    const customColumnFilters = customColumns.map((cc) => ({
      name: cc.name,
      key: `custom:${cc.name}`,
      dataType: cc.dataType === "number" ? ("number" as const) : ("string" as const),
    }));
    return [...datasetFilters, ...customColumnFilters];
  }, [customColumns]);

  const fetchCount = useCallback(async () => {
    const params = buildFetchParams({ pageNumber: 0, pageSize: FETCH_SIZE, filter }, columnDefs);
    const url = `/api/projects/${projectId}/datasets/${dataset.id}/count?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errMessage = await res
        .json()
        .then((d) => d?.error)
        .catch(() => null);
      throw new Error(errMessage ?? "Failed to fetch count");
    }

    const data = await res.json();
    return data.totalCount;
  }, [projectId, dataset.id, filter, columnDefs]);

  useEffect(() => {
    fetchCount()
      .then((count) => {
        setTotalCount(count);
      })
      .catch((e) => {
        console.error("Error fetching dataset count:", e);
        setTotalCount(0);
      });
  }, [fetchCount]);

  const datapointId = searchParams.get("datapointId");
  const [selectedDatapoint, setSelectedDatapoint] = useState<Datapoint | null>(null);
  const [isEditingDatapoint, setIsEditingDatapoint] = useState(false);

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      try {
        const params = buildFetchParams({ pageNumber, pageSize: FETCH_SIZE, filter }, columnDefs);
        const url = `/api/projects/${projectId}/datasets/${dataset.id}/datapoints?${params.toString()}`;
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
    [projectId, dataset.id, filter, columnDefs, toast]
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
    deps: [dataset.id, filter, columnSqls],
  });

  const selectedDatapointIds = useMemo(() => Object.keys(rowSelection), [rowSelection]);
  const handleDatapointSelect = useCallback((datapoint: Row<Datapoint> | null) => {
    if (datapoint) {
      setSelectedDatapoint(datapoint.original);
    } else {
      setSelectedDatapoint(null);
    }
  }, []);

  const getRowHref = useCallback(
    (row: Row<Datapoint>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("datapointId", row.id);
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
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

  const handlePanelClose = useCallback(() => {
    setIsEditingDatapoint(false);
    setSelectedDatapoint(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("datapointId");
    router.push(`${pathName}?${params.toString()}`);
  }, [pathName, router, searchParams]);

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
          setSelectedDatapoint(null);
          const params = new URLSearchParams(searchParams.toString());
          params.delete("datapointId");
          router.push(`${pathName}?${params.toString()}`);
        }
      } catch (error) {
        toast({
          title: "Failed to delete datapoints",
          variant: "destructive",
        });
      }
    },
    [dataset.id, pathName, projectId, router, searchParams, selectedDatapoint, toast, updateData]
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

  const columnLabels = useMemo(
    () =>
      columnDefs.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
        ...(column.id!.startsWith("custom:") && {
          onDelete: () => removeCustomColumn(column.id!.replace("custom:", "")),
        }),
      })),
    [columnDefs, removeCustomColumn]
  );

  return (
    <>
      <Header path={"datasets/" + dataset.name} />
      <div
        className={cn("flex px-4 pb-4 flex-col gap-4 overflow-hidden flex-1", {
          "pointer-events-none opacity-60": isEditingDatapoint,
        })}
      >
        <div className="flex flex-wrap items-end gap-2">
          <RenameDatasetDialog dataset={dataset} />
          <DownloadButton
            uri={`/api/projects/${projectId}/datasets/${dataset.id}/download`}
            supportedFormats={["csv", "json"]}
            filenameFallback={`${dataset.name.replace(/[^a-zA-Z0-9-_.]/g, "_")}-${dataset.id}`}
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
            columns={columnDefs}
            data={datapoints}
            hasMore={hasMore}
            isFetching={isFetching}
            isLoading={isLoading}
            fetchNextPage={fetchNextPage}
            getRowId={(datapoint) => datapoint.id}
            onRowClick={handleDatapointSelect}
            getRowHref={getRowHref}
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
          >
            <div className="flex flex-1 w-full space-x-2">
              <DatasetColumnsMenu columnLabels={columnLabels} columnDefs={columnDefs} />
              <ViewsToolbar projectId={String(projectId)} resource={RESOURCE} />
            </div>
            <div className="w-full px-px">
              <AdvancedSearch
                filters={allFilters}
                value={searchValue}
                onChange={handleSearchChange}
                storageKey={`dataset-${dataset.id}`}
                placeholder="Filter by id, metadata, data, target..."
                className="w-full flex-1"
              />
            </div>
          </InfiniteDataTable>
        </div>
        <div className="flex text-secondary-foreground text-sm">{totalCount} datapoints</div>
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
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultDatasetColumnOrder }}
      lockedColumns={["__row_selection"]}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <DatasetContent {...props} />
    </InfiniteDataTableProvider>
  );
}
