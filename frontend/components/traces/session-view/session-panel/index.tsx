"use client";

import { AlertTriangle } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";

import { useSessionViewBaseStore } from "../store";
import SessionList from "./list";

interface SessionPanelProps {
  // Regular-only slots, built by SessionViewContent via the concrete store. The
  // debugger passes none — so no concrete hook (search/timeline) runs under its
  // provider. `timelinePanel` is the resizable timeline strip above the list.
  searchSlot?: ReactNode;
  timelineToggle?: ReactNode;
  timelinePanel?: ReactNode;
}

/**
 * Shell around the session view — header (stats + optional timeline toggle),
 * optional advanced-search input, optional session timeline, stats shields. The
 * virtualized row list lives in `./list.tsx`. Search/timeline are passed in as
 * slots so the debugger context (which has no concrete store) renders neither.
 */
export default function SessionPanel({ searchSlot, timelineToggle, timelinePanel }: SessionPanelProps) {
  const { traces, isTracesLoading, tracesError } = useSessionViewBaseStore(
    (s) => ({
      traces: s.traces,
      isTracesLoading: s.isTracesLoading,
      tracesError: s.tracesError,
    }),
    shallow
  );

  const sessionStats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1">
      {/* Header */}
      <div className="flex flex-col gap-1.5 px-2 py-2 shrink-0">
        <div className="flex h-7 items-center justify-start gap-2">
          {sessionStats && <StatsShields stats={sessionStats} labelPrefix="Session" />}
          {traces.length > 0 && timelineToggle}
        </div>
        {searchSlot}
      </div>

      {/* Body */}
      {tracesError ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Session</h3>
          <p className="text-sm text-muted-foreground">{tracesError}</p>
        </div>
      ) : isTracesLoading && traces.length === 0 ? (
        <div className="flex flex-col gap-2 px-4 py-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ResizablePanelGroup id="session-view-panels" orientation="vertical" className="flex-1 min-h-0">
          {timelinePanel && (
            <>
              <ResizablePanel defaultSize={120} minSize={80}>
                <div className="border-t h-full">{timelinePanel}</div>
              </ResizablePanel>
              <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors hover:scale-200 mb-2" />
            </>
          )}
          <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden">
            <SessionList />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
