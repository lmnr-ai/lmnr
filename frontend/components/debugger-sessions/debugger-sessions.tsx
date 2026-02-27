"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { CheckCircle2, Clock, Loader2, SquareArrowOutUpRight, StopCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Badge } from "@/components/ui/badge.tsx";
import Header from "@/components/ui/header";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks/use-infinite-scroll";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import Mono from "@/components/ui/mono";
import { TableCell, TableRow } from "@/components/ui/table.tsx";
import { type DebuggerSession, type DebuggerSessionStatus } from "@/lib/actions/debugger-sessions";
import { useToast } from "@/lib/hooks/use-toast";

const FETCH_SIZE = 50;

const STATUS_CONFIG: Record<DebuggerSessionStatus, { label: string; icon: ReactNode; classes: string }> = {
  PENDING: {
    label: "Pending",
    icon: <Clock className="w-3 h-3" />,
    classes: "bg-muted text-muted-foreground border-muted",
  },
  RUNNING: {
    label: "Running",
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    classes: "bg-primary/20 text-primary border-primary/30",
  },
  FINISHED: {
    label: "Finished",
    icon: <CheckCircle2 className="w-3 h-3" />,
    classes: "bg-success/20 text-success-bright border-success/30",
  },
  STOPPED: {
    label: "Stopped",
    icon: <StopCircle className="w-3 h-3" />,
    classes: "bg-destructive/20 text-destructive-bright border-destructive/30",
  },
};

const columns: ColumnDef<DebuggerSession>[] = [
  {
    cell: ({ row }) => <Mono className="text-xs text-muted-foreground">{row.original.id}</Mono>,
    size: 120,
    header: "ID",
    id: "id",
  },
  {
    cell: ({ row }) => (
      <div title={row.original.name ?? "-"} className="text-sm truncate">
        {row.original.name ?? "-"}
      </div>
    ),
    header: "Name",
    id: "name",
  },
  {
    cell: ({ row }) => {
      const config = STATUS_CONFIG[row.original.status];
      if (!config) return "-";

      return (
        <Badge className={`rounded-3xl gap-1.5 ${config.classes}`} variant="outline">
          {config.icon}
          {config.label}
        </Badge>
      );
    },
    header: "Status",
    id: "status",
  },
  {
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "createdAt",
    size: 180,
  },
];

const defaultDebuggerSessionsColumnOrder = ["id", "name", "status", "createdAt"];

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No active debugger sessions</h3>
          <p className="text-sm text-muted-foreground text-center">
            Active sessions will appear here when you start one from the CLI with{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">npx lmnr-cli dev</code>.
          </p>
          <a
            href="https://docs.laminar.sh/platform/debugger-sessions"
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
      <Header path="debugger sessions" />
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
            emptyRow={EmptyRow}
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
