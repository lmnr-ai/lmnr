"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { SquareArrowOutUpRight } from "lucide-react";
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
import { TableCell, TableRow } from "@/components/ui/table";
import { type RolloutSession, type RolloutSessionStatus } from "@/lib/actions/rollout-sessions";
import { useToast } from "@/lib/hooks/use-toast";

const FETCH_SIZE = 50;

const STATUS_COLORS: Record<RolloutSessionStatus, string> = {
  PENDING: "bg-muted text-muted-foreground border-muted",
  RUNNING: "bg-primary/20 text-primary border-primary/30",
  FINISHED: "bg-success/20 text-success-bright border-success/30",
  STOPPED: "bg-destructive/20 text-destructive-bright border-destructive/30",
};

const columns: ColumnDef<RolloutSession>[] = [
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

const defaultRolloutSessionsColumnOrder = ["id", "name", "status", "createdAt"];

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No active rollout sessions</h3>
          <p className="text-sm text-muted-foreground text-center">
            Active sessions will appear here when you start one from the CLI with{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">npx lmnr-cli dev</code>.
          </p>
          <a
            href="https://docs.laminar.sh/platform/rollout-sessions"
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

function RolloutSessionsContent() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const fetchRolloutSessions = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        const url = `/api/projects/${projectId}/rollout-sessions?${urlParams.toString()}`;

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

        const data = (await res.json()) as { items: RolloutSession[] };
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load rollout sessions. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, toast]
  );

  const {
    data: rolloutSessions,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<RolloutSession>({
    fetchFn: fetchRolloutSessions,
    enabled: true,
    deps: [projectId],
  });

  return (
    <>
      <Header path="rollout-sessions" />
      <div className="flex px-4 pb-4 flex-col gap-4 overflow-hidden flex-1">
        <div className="flex overflow-hidden flex-1">
          <InfiniteDataTable
            getRowId={(row: RolloutSession) => row.id}
            columns={columns}
            data={rolloutSessions ?? []}
            hasMore={hasMore}
            getRowHref={(row) => `rollout-sessions/${row.id}`}
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

export default function RolloutSessions() {
  return (
    <DataTableStateProvider storageKey="rollout-sessions-table" defaultColumnOrder={defaultRolloutSessionsColumnOrder}>
      <RolloutSessionsContent />
    </DataTableStateProvider>
  );
}
