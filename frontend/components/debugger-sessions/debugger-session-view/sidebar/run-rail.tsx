"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import type { TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useDebuggerSessionStore } from "../store";

const RunStatusDot = ({ status }: { status: string }) => (
  <div
    title={status === "error" ? "Error" : "Success"}
    className={cn("min-h-4 w-1.5 rounded-[2.5px] shrink-0 bg-success-bright", {
      "bg-destructive-bright": status === "error",
    })}
  />
);

const RunRail = () => {
  const { projectId, id: sessionId } = useParams<{ projectId: string; id: string }>();
  const { historyRuns, isHistoryLoading, setHistoryRuns, setIsHistoryLoading, loadHistoryTrace, trace } =
    useDebuggerSessionStore(
      useShallow((state) => ({
        historyRuns: state.historyRuns,
        isHistoryLoading: state.isHistoryLoading,
        setHistoryRuns: state.setHistoryRuns,
        setIsHistoryLoading: state.setIsHistoryLoading,
        loadHistoryTrace: state.loadHistoryTrace,
        trace: state.trace,
      }))
    );

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
      // Sort newest-first so historyRuns[0] is the latest run regardless of the
      // traces endpoint's default order, and the rail lists runs latest-first.
      const sorted = (data.items ?? [])
        .slice()
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      setHistoryRuns(sorted);
    } catch (error) {
      console.error("Failed to load session runs:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [projectId, sessionId, setHistoryRuns, setIsHistoryLoading]);

  useEffect(() => {
    if (!projectId || !sessionId) return;
    fetchHistory();
  }, [fetchHistory, projectId, sessionId]);

  // Default to the latest run once runs are loaded and nothing is selected.
  useEffect(() => {
    if (trace?.id || historyRuns.length === 0) return;
    const latest = historyRuns[0];
    loadHistoryTrace(projectId, latest.id, latest.startTime, latest.endTime);
  }, [historyRuns, trace?.id, loadHistoryTrace, projectId]);

  const handleRunClick = useCallback(
    (run: TraceRow) => {
      if (run.id === trace?.id) return;
      loadHistoryTrace(projectId, run.id, run.startTime, run.endTime);
    },
    [projectId, trace?.id, loadHistoryTrace]
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h4 className="text-xs font-semibold text-secondary-foreground">Runs</h4>
        <span className="text-xs text-muted-foreground">{historyRuns.length}</span>
      </div>
      <div className="flex flex-col overflow-y-auto flex-1">
        {isHistoryLoading && historyRuns.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading runs…</div>
        ) : historyRuns.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No runs yet. Runs appear here as your agent executes against this session.
          </div>
        ) : (
          historyRuns.map((run) => {
            const isSelected = run.id === trace?.id;
            return (
              <button
                key={run.id}
                onClick={() => handleRunClick(run)}
                className={cn(
                  "flex items-center justify-between gap-2 px-4 py-2 text-left border-b transition-colors",
                  isSelected
                    ? "bg-primary/15 border-l-2 border-l-primary"
                    : "hover:bg-secondary border-l-2 border-l-transparent"
                )}
              >
                <div className="flex flex-col min-w-0">
                  <ClientTimestampFormatter
                    timestamp={run.startTime}
                    className="text-xs text-secondary-foreground truncate"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono truncate">{run.id}</span>
                </div>
                <RunStatusDot status={run.status} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RunRail;
