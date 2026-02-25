"use client";

import { type Row } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import type { TraceRow } from "@/lib/traces/types";

import { useDebuggerSessionStoreContext } from "../debugger-session-store";
import { FETCH_SIZE, sidebarColumnOrder, sidebarTraceColumns } from "./columns";

const RunsContent = () => {
  const { projectId, id: sessionId } = useParams<{ projectId: string; id: string }>();
  const { historyRuns, isHistoryLoading, setHistoryRuns, setIsHistoryLoading, loadHistoryTrace, trace } =
    useDebuggerSessionStoreContext((state) => ({
      historyRuns: state.historyRuns,
      isHistoryLoading: state.isHistoryLoading,
      setHistoryRuns: state.setHistoryRuns,
      setIsHistoryLoading: state.setIsHistoryLoading,
      loadHistoryTrace: state.loadHistoryTrace,
      trace: state.trace,
    }));

  const fetchHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", "0");
      urlParams.set("pageSize", "50");
      urlParams.append(
        "filter",
        JSON.stringify({
          column: "metadata",
          operator: "eq",
          value: `rollout.session_id=${sessionId}`,
        })
      );

      const res = await fetch(`/api/projects/${projectId}/traces?${urlParams.toString()}`);
      if (!res.ok) return;

      const data = (await res.json()) as { items: TraceRow[] };
      setHistoryRuns(data.items ?? []);
    } catch (error) {
      console.error("Failed to load session history:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [projectId, sessionId, setHistoryRuns, setIsHistoryLoading]);

  useEffect(() => {
    if (!projectId || !sessionId) return;
    fetchHistory();
  }, [fetchHistory, projectId, sessionId]);

  const handleRowClick = useCallback(
    (row: Row<TraceRow>) => {
      const r = row.original;
      if (r.id === trace?.id) return;
      loadHistoryTrace(projectId, r.id, r.startTime, r.endTime);
    },
    [projectId, trace?.id, loadHistoryTrace]
  );

  const noop = useCallback(() => {}, []);

  return (
    <InfiniteDataTable<TraceRow>
      className="w-full"
      columns={sidebarTraceColumns}
      data={historyRuns}
      getRowId={(t) => t.id}
      onRowClick={handleRowClick}
      focusedRowId={trace?.id}
      hasMore={false}
      isFetching={false}
      isLoading={isHistoryLoading}
      fetchNextPage={noop}
      estimatedRowHeight={36}
      lockedColumns={["status"]}
    >
      <div className="flex gap-2 w-full items-center">
        <RefreshButton onClick={fetchHistory} variant="outline" />
      </div>
    </InfiniteDataTable>
  );
};

export default function RunsTab() {
  return (
    <DataTableStateProvider defaultColumnOrder={sidebarColumnOrder} pageSize={FETCH_SIZE}>
      <RunsContent />
    </DataTableStateProvider>
  );
}
