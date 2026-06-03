"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import TmpControlPanel from "@/components/debugger-sessions/debugger-session-view/tmp-control-panel";
import { useTmpVariantStore } from "@/components/debugger-sessions/debugger-session-view/tmp-variant-store";
import SessionsPlaceholder from "@/components/debugger-sessions/sessions-placeholder";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import Header from "@/components/ui/header";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks/use-infinite-scroll";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import Mono from "@/components/ui/mono";
import { type DebuggerSession } from "@/lib/actions/debugger-sessions";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const FETCH_SIZE = 50;
const RESOURCE = "debugger-sessions";

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
    header: "Last activity",
    accessorKey: "lastActivity",
    cell: ({ row }) =>
      row.original.lastActivity ? (
        <ClientTimestampFormatter timestamp={row.original.lastActivity} />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    id: "lastActivity",
    size: 180,
  },
  {
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "createdAt",
    size: 180,
  },
];

const defaultDebuggerSessionsColumnOrder = ["id", "name", "lastActivity", "createdAt"];

function DebuggerSessionsContent() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // TODO: remove — lets us preview the empty/onboarding state even with sessions.
  const forceEmptyState = useTmpVariantStore((s) => s.forceEmptyState);

  useEffect(() => {
    track("debugger_sessions", "page_viewed");
  }, []);

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

  // Show the stylized startup page (not the table) once we know the project has
  // no sessions. `forceEmptyState` is a temp toggle for previewing.
  const showPlaceholder = forceEmptyState || (!isLoading && (debuggerSessions?.length ?? 0) === 0);

  if (showPlaceholder) {
    return (
      <>
        {/* TODO: remove — testing control panel (toggle the empty/onboarding state). */}
        <TmpControlPanel />
        {/* SessionsPlaceholder renders its own Header. */}
        <SessionsPlaceholder />
      </>
    );
  }

  return (
    <>
      {/* TODO: remove — testing control panel (toggle the empty/onboarding state). */}
      <TmpControlPanel />
      <Header path="debugger sessions" />
      <div className="flex px-4 pb-4 flex-col gap-4 overflow-hidden flex-1">
        <div className="flex overflow-hidden flex-1">
          <InfiniteDataTable
            getRowId={(row: DebuggerSession) => row.id}
            columns={columns}
            data={debuggerSessions ?? []}
            hasMore={hasMore}
            getRowHref={(row) => `debugger-sessions/${row.id}`}
            onRowClick={() => track("debugger_sessions", "session_opened")}
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
              <ViewsToolbar projectId={String(projectId)} resource={RESOURCE} />
            </div>
          </InfiniteDataTable>
        </div>
      </div>
    </>
  );
}

export default function DebuggerSessions() {
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultDebuggerSessionsColumnOrder }}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <DebuggerSessionsContent />
    </InfiniteDataTableProvider>
  );
}
