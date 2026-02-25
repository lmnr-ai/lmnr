"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Badge } from "@/components/ui/badge.tsx";
import Header from "@/components/ui/header";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks/use-infinite-scroll";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import Mono from "@/components/ui/mono";
import { type DebuggerSession, type DebuggerSessionStatus } from "@/lib/actions/debugger-sessions";
import { useToast } from "@/lib/hooks/use-toast";

const FETCH_SIZE = 50;

const STATUS_COLORS: Record<DebuggerSessionStatus, string> = {
  PENDING: "bg-muted text-muted-foreground border-muted",
  RUNNING: "bg-primary/20 text-primary border-primary/30",
  FINISHED: "bg-success/20 text-success-bright border-success/30",
  STOPPED: "bg-destructive/20 text-destructive-bright border-destructive/30",
};

const columns: ColumnDef<DebuggerSession>[] = [
  {
    cell: ({ row }) => <Mono className="text-xs">{row.original.id}</Mono>,
    size: 300,
    header: "ID",
    id: "id",
  },
  {
    cell: ({ row }) => (
      <div title={row.original.name ?? "-"} className="text-sm truncate text-muted-foreground">
        {row.original.name ?? "-"}
      </div>
    ),
    header: "Name",
    id: "name",
  },
  {
    cell: ({ row }) => {
      const status = row.original.status;
      const colorClasses = STATUS_COLORS[status] || "text-secondary-foreground";

      return (
        <Badge className={`rounded-3xl mr-1 ${colorClasses}`} variant="outline">
          {status}
        </Badge>
      );
    },
    header: "Status",
    id: "status",
  },
  {
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
    id: "createdAt",
    size: 180,
  },
];

const defaultDebuggerSessionsColumnOrder = ["id", "name", "status", "createdAt"];

function DebuggerSessionsContent() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const fetchDebuggerSessions = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        const url = `/api/projects/${projectId}/debugger-sessions?${urlParams.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: DebuggerSession[] };
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load debugger sessions. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, toast]
  );

  const {
    data: debuggerSessions,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<DebuggerSession>({
    fetchFn: fetchDebuggerSessions,
    enabled: true,
    deps: [projectId],
  });

  return (
    <>
      <Header path="debugger-sessions" />
      <div className="flex px-4 pb-4 flex-col gap-4 overflow-hidden flex-1">
        <div className="flex overflow-hidden flex-1">
          <InfiniteDataTable
            getRowId={(row: DebuggerSession) => row.id}
            columns={columns}
            data={debuggerSessions ?? []}
            hasMore={hasMore}
            getRowHref={(row) => `debugger-sessions/${row.id}`}
            isFetching={isFetching}
            isLoading={isLoading}
            fetchNextPage={fetchNextPage}
            state={{
              rowSelection,
            }}
            onRowSelectionChange={setRowSelection}
          >
            <div className="flex flex-1 w-full space-x-2 pt-1">
              <ColumnsMenu
                columnLabels={columns.map((column) => ({
                  id: column.id!,
                  label: typeof column.header === "string" ? column.header : column.id!,
                }))}
              />
            </div>
          </InfiniteDataTable>
        </div>
      </div>
    </>
  );
}

export default function DebuggerSessions() {
  return (
    <DataTableStateProvider
      storageKey="debugger-sessions-table"
      defaultColumnOrder={defaultDebuggerSessionsColumnOrder}
    >
      <DebuggerSessionsContent />
    </DataTableStateProvider>
  );
}
