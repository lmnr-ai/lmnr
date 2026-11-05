"use client";

import { memo, type PropsWithChildren, useCallback, useState } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { type AuditLogEvent } from "@/lib/actions/audit-log/types";
import { useToast } from "@/lib/hooks/use-toast";

import { columns } from "./columns";
import { FETCH_SIZE } from "./constants";
import AuditEventDetails from "./event-details";

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <p className="text-sm text-muted-foreground">No audit events in this time range.</p>
    </TableCell>
  </TableRow>
);

interface AuditLogTableContentsProps {
  workspaceId: string;
  /** The list query string without paging: filters and the time range. */
  query: string;
  hasFilters: boolean;
}

export const AuditLogTableContents = memo(function AuditLogTableContents({
  children,
  workspaceId,
  query,
  hasFilters,
}: PropsWithChildren<AuditLogTableContentsProps>) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<AuditLogEvent | null>(null);

  const fetchEvents = useCallback(
    async (pageNumber: number) => {
      try {
        const params = new URLSearchParams(query);
        params.set("pageNumber", String(pageNumber));
        params.set("pageSize", String(FETCH_SIZE));
        const res = await fetch(`/api/workspaces/${workspaceId}/audit-events?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load the audit log");
        }
        return (await res.json()) as { items: AuditLogEvent[] };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load the audit log",
          variant: "destructive",
        });
        throw error;
      }
    },
    [workspaceId, query, toast]
  );

  const { data, hasMore, isFetching, isLoading, fetchNextPage } = useInfiniteScroll<AuditLogEvent>({
    fetchFn: fetchEvents,
    deps: [workspaceId, query],
  });

  const onRowClick = useCallback((row: { original: AuditLogEvent }) => setSelected(row.original), []);
  const onCloseDetails = useCallback(() => setSelected(null), []);

  return (
    <>
      <InfiniteDataTable<AuditLogEvent>
        className="w-full"
        columns={columns}
        data={data ?? []}
        getRowId={(row) => row.eventId}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        onRowClick={onRowClick}
        emptyRow={hasFilters ? undefined : EmptyRow}
      >
        {children}
      </InfiniteDataTable>
      <AuditEventDetails event={selected} onClose={onCloseDetails} />
    </>
  );
});
