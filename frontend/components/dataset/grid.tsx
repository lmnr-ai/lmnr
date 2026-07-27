"use client";

import { type ColumnDef, type OnChangeFn, type Row, type RowSelectionState } from "@tanstack/react-table";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { memo, type MutableRefObject, type ReactNode, useCallback, useEffect } from "react";

import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { type Datapoint, type Dataset as DatasetType } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";

import { buildFetchParams } from "./dataset-table-store";

const FETCH_SIZE = 50;

export interface DatasetGridProps {
  chrome: ReactNode;
  dataset: DatasetType;
  columnDefs: ColumnDef<Datapoint>[];
  filter: string[];
  columnSqls: (string | undefined)[];
  isViewLoading: boolean;
  datapointId: string | null;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onRowClick: (row: Row<Datapoint> | null) => void;
  onDeleteDatapoints: (ids: string[]) => Promise<void>;
  refetchRef: MutableRefObject<() => void>;
  updateDataRef: MutableRefObject<((updater: (data: Datapoint[]) => Datapoint[]) => void) | null>;
}

export const DatasetGrid = memo(function DatasetGrid({
  chrome,
  dataset,
  columnDefs,
  filter,
  columnSqls,
  isViewLoading,
  datapointId,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
  onDeleteDatapoints,
  refetchRef,
  updateDataRef,
}: DatasetGridProps) {
  const { toast } = useToast();
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const pathName = usePathname();

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      try {
        const params = buildFetchParams({ pageNumber, pageSize: FETCH_SIZE, filter }, columnDefs);
        const url = `/api/projects/${projectId}/datasets/${dataset.id}/datapoints?${params.toString()}`;
        const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });

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

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  useEffect(() => {
    updateDataRef.current = updateData;
  }, [updateData, updateDataRef]);

  const getRowHref = useCallback(
    (row: Row<Datapoint>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("datapointId", row.id);
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  return (
    <InfiniteDataTable
      columns={columnDefs}
      data={datapoints}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading}
      fetchNextPage={fetchNextPage}
      getRowId={(datapoint) => datapoint.id}
      onRowClick={onRowClick}
      getRowHref={getRowHref}
      focusedRowId={datapointId}
      enableRowSelection
      state={{ rowSelection }}
      onRowSelectionChange={onRowSelectionChange}
      className="flex-1"
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={onDeleteDatapoints} entityName="datapoints" />
        </div>
      )}
    >
      {chrome}
    </InfiniteDataTable>
  );
});
