"use client";

import { times } from "lodash";
import { Check, X } from "lucide-react";
import { useParams } from "next/navigation";
import { memo, useCallback, useEffect } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils";

import { type HistoryRun, useRolloutSessionStoreContext } from "./rollout-session-store";

const RolloutSessionHistory = () => {
  const { projectId, id: sessionId } = useParams<{ projectId: string; id: string }>();
  const { setIsHistoryLoading, setHistoryRuns } = useRolloutSessionStoreContext((state) => ({
    setIsHistoryLoading: state.setIsHistoryLoading,
    setHistoryRuns: state.setHistoryRuns,
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

      const data = (await res.json()) as { items: TraceViewTrace[] };
      const items = data.items ?? [];
      setHistoryRuns(
        items.map((t) => ({
          traceId: t.id,
          startTime: t.startTime,
          endTime: t.endTime,
          status: t.status,
        }))
      );
    } catch (error) {
      console.error("Failed to load session history:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [projectId, sessionId, setHistoryRuns, setIsHistoryLoading]);

  useEffect(() => {
    if (!projectId || !sessionId) return;

    fetchHistory();
  }, [fetchHistory, projectId, sessionId, setHistoryRuns, setIsHistoryLoading]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-1 gap-2 justify-between">
        <h4 className="text-sm font-semibold">Run History</h4>
        <RefreshButton variant="ghost" onClick={fetchHistory} />
      </div>
      <ScrollArea>
        <div className="flex flex-col gap-0.5 h-48">
          <RolloutSessionHistoryList />
        </div>
      </ScrollArea>
    </div>
  );
};

const RolloutSessionHistoryList = () => {
  const { projectId } = useParams<{ projectId: string; id: string }>();
  const { runs, isLoading, trace, loadHistoryTrace } = useRolloutSessionStoreContext((state) => ({
    trace: state.trace,
    loadHistoryTrace: state.loadHistoryTrace,
    runs: state.historyRuns,
    isLoading: state.isHistoryLoading,
  }));

  const handleTraceClick = useCallback(
    (run: HistoryRun) => {
      if (run.traceId === trace?.id) return;
      loadHistoryTrace(projectId as string, run.traceId, run.startTime, run.endTime);
    },
    [projectId, trace?.id, loadHistoryTrace]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {times(4, (i) => (
          <Skeleton key={i} className="h-7.5 w-full" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground text-center py-4">No runs yet</p>
      </div>
    );
  }

  return runs.map((run) => {
    const isActive = run.traceId === trace?.id;
    const startTime = isActive && trace?.startTime ? trace.startTime : run.startTime;
    const endTime = isActive && trace?.endTime ? trace.endTime : run.endTime;
    const start = new Date(startTime);
    const end = new Date(endTime);
    const hasValidDuration = !isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start;
    const duration = hasValidDuration ? ((end.getTime() - start.getTime()) / 1000).toFixed(2) : null;

    return (
      <button
        key={run.traceId}
        onClick={() => handleTraceClick(run)}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors",
          "hover:bg-secondary/80 w-full",
          isActive && "bg-secondary"
        )}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {run.status === "error" ? (
            <X size={12} className="text-destructive shrink-0" />
          ) : (
            <Check size={12} className="text-success shrink-0" />
          )}
          <span className="truncate text-muted-foreground">
            <ClientTimestampFormatter timestamp={startTime} />
          </span>
        </div>
        {duration && <span className="text-muted-foreground shrink-0">{duration}s</span>}
      </button>
    );
  });
};
export default memo(RolloutSessionHistory);
