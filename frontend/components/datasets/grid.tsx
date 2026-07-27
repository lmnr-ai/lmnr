"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { SquareArrowOutUpRight } from "lucide-react";
import { useParams } from "next/navigation";
import { memo, type MutableRefObject, type ReactNode, useCallback, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { FETCH_SIZE } from "@/components/datasets/constants";
import CopyTooltip from "@/components/ui/copy-tooltip";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import Mono from "@/components/ui/mono";
import { TableCell, TableRow } from "@/components/ui/table";
import { type DatasetInfo } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const columns: ColumnDef<DatasetInfo>[] = [
  {
    cell: ({ row }) => (
      <CopyTooltip value={row.original.id} className="block truncate">
        <Mono className="text-xs">{row.original.id}</Mono>
      </CopyTooltip>
    ),
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
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
    id: "createdAt",
  },
];

export const datasetsColumnLabels = columns.map((col) => ({
  id: col.id!,
  label: typeof col.header === "string" ? col.header : col.id!,
}));

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No datasets yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Datasets store collections of datapoints for evaluations and fine-tuning. Click + Dataset above to create
            one.
          </p>
          <a
            href="https://laminar.sh/docs/datasets/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

export interface DatasetsGridProps {
  chrome: ReactNode;
  updateDataRef: MutableRefObject<((fn: (data: DatasetInfo[]) => DatasetInfo[]) => void) | null>;
  filter: string[];
  search: string | null;
  isViewLoading: boolean;
}

export const DatasetsGrid = memo(function DatasetsGrid({
  chrome,
  updateDataRef,
  filter,
  search,
  isViewLoading,
}: DatasetsGridProps) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
          headers: { "Content-Type": "application/json" },
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
    enabled: !isViewLoading,
    deps: [projectId, filter, search],
  });

  updateDataRef.current = updateData;

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
        track("datasets", "deleted", { count: datasetIds.length });
        toast({
          title: "Datasets deleted",
          description: `Successfully deleted ${datasetIds.length} dataset(s).`,
        });
      } catch {
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
    <InfiniteDataTable<DatasetInfo>
      className="w-full"
      enableRowSelection={true}
      getRowHref={(row) => `/project/${projectId}/datasets/${row.original.id}`}
      getRowId={(row) => row.id}
      columns={columns}
      data={datasets}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading}
      fetchNextPage={fetchNextPage}
      state={{ rowSelection }}
      onRowSelectionChange={setRowSelection}
      emptyRow={filter.length === 0 && !search ? EmptyRow : undefined}
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDeleteDatasets} entityName="datasets" />
        </div>
      )}
    >
      {chrome}
    </InfiniteDataTable>
  );
});
