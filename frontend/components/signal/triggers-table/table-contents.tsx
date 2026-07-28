"use client";

import { type Row, type RowSelectionState } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { memo, type MutableRefObject, type PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";

import { useSignalStoreContext } from "@/components/signal/store";
import { getTriggersTableColumns, type TriggerRow } from "@/components/signal/triggers-table/columns";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { TableCell, TableRow } from "@/components/ui/table";
import { type Filter } from "@/lib/actions/common/filters";
import { type Trigger } from "@/lib/actions/signal-triggers";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No triggers yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Triggers are used to automatically execute signals when certain conditions are met. Create your first
            trigger to start automating signal execution.
          </p>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

export interface TriggersTableContentsProps {
  filters: Filter[];
  onRowClick: (row: Row<TriggerRow>) => void;
  revalidateRef: MutableRefObject<() => void>;
}

export const TriggersTableContents = memo(function TriggersTableContents({
  children,
  filters,
  onRowClick,
  revalidateRef,
}: PropsWithChildren<TriggersTableContentsProps>) {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const { signal } = useSignalStoreContext((state) => ({ signal: state.signal }));
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const columns = getTriggersTableColumns();

  const triggersUrl = useMemo(() => {
    const urlParams = new URLSearchParams();
    filters.forEach((f) => urlParams.append("filter", JSON.stringify(f)));
    const queryString = urlParams.toString();
    return `/api/projects/${params.projectId}/signals/${signal.id}/triggers${queryString ? `?${queryString}` : ""}`;
  }, [params.projectId, signal.id, filters]);

  const { data, isLoading, error } = useSWR<{ items: Trigger[] }>(triggersUrl, swrFetcher);

  useEffect(() => {
    revalidateRef.current = () => mutate(triggersUrl);
  }, [triggersUrl, revalidateRef]);

  useEffect(() => {
    if (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load triggers.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const triggers: TriggerRow[] = data?.items || [];

  const handleDeleteTriggers = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const response = await fetch(`/api/projects/${params.projectId}/signals/${signal.id}/triggers`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerIds: selectedRowIds }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to delete triggers");
        }

        await mutate(triggersUrl);
        setRowSelection({});
        toast({
          title: "Triggers deleted",
          description: `Successfully deleted ${selectedRowIds.length} trigger(s).`,
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete triggers",
        });
      }
    },
    [params.projectId, signal.id, triggersUrl, toast]
  );

  return (
    <InfiniteDataTable<TriggerRow>
      className="w-full"
      columns={columns}
      data={triggers}
      getRowId={(trigger) => trigger.id}
      hasMore={false}
      isFetching={isLoading}
      isLoading={isLoading}
      fetchNextPage={() => {}}
      onRowClick={onRowClick}
      enableRowSelection
      state={{ rowSelection }}
      onRowSelectionChange={setRowSelection}
      selectionPanel={(selectedRowIds) => (
        <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDeleteTriggers} entityName="triggers" />
      )}
      emptyRow={EmptyRow}
    >
      {children}
    </InfiniteDataTable>
  );
});
