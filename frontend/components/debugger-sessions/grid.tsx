"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { memo, type ReactNode, useCallback, useState } from "react";

import SessionsPlaceholder from "@/components/debugger-sessions/sessions-placeholder";
import Header from "@/components/ui/header";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks/use-infinite-scroll";
import { type DebuggerSession } from "@/lib/actions/debugger-sessions";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const FETCH_SIZE = 50;

export interface DebuggerSessionsGridProps {
  chrome: ReactNode;
  columns: ColumnDef<DebuggerSession>[];
}

export const DebuggerSessionsGrid = memo(function DebuggerSessionsGrid({ chrome, columns }: DebuggerSessionsGridProps) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const fetchDebuggerSessions = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        const res = await fetch(`/api/projects/${projectId}/debugger-sessions?${urlParams.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
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

  const showPlaceholder = !isLoading && (debuggerSessions?.length ?? 0) === 0;

  if (showPlaceholder) {
    return <SessionsPlaceholder />;
  }

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
            onRowClick={() => track("debugger_sessions", "session_opened")}
            isFetching={isFetching}
            isLoading={isLoading}
            fetchNextPage={fetchNextPage}
            state={{ rowSelection }}
            onRowSelectionChange={setRowSelection}
          >
            {chrome}
          </InfiniteDataTable>
        </div>
      </div>
    </>
  );
});
