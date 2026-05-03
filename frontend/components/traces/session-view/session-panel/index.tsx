"use client";

import { AlertTriangle, CirclePlay, GanttChart } from "lucide-react";
import { useCallback, useMemo } from "react";
import { shallow } from "zustand/shallow";

import AdvancedSearch from "@/components/common/advanced-search";
import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import { filterColumns } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { type Filter } from "@/lib/actions/common/filters";
import { cn } from "@/lib/utils";

import SessionTimeline from "../session-timeline";
import { useSessionViewStore } from "../store";
import SessionList from "./list";

/**
 * Shell around the session view — header (session-id dropdown),
 * advanced-search input, optional session timeline, stats shields. The
 * virtualized row list lives in `./list.tsx`.
 */
export default function SessionPanel() {
  const {
    traces,
    isTracesLoading,
    tracesError,
    searchSessionSpans,
    clearSearch,
    sessionTimelineEnabled,
    setSessionTimelineEnabled,
    mediaPanelOpen,
    setMediaPanelOpen,
  } = useSessionViewStore(
    (s) => ({
      traces: s.traces,
      isTracesLoading: s.isTracesLoading,
      tracesError: s.tracesError,
      searchSessionSpans: s.searchSessionSpans,
      clearSearch: s.clearSearch,
      sessionTimelineEnabled: s.sessionTimelineEnabled,
      setSessionTimelineEnabled: s.setSessionTimelineEnabled,
      mediaPanelOpen: s.mediaPanelOpen,
      setMediaPanelOpen: s.setMediaPanelOpen,
    }),
    shallow
  );

  const handleSearch = useCallback(
    (filters: Filter[], search: string) => {
      if (!search && filters.length === 0) {
        clearSearch();
      } else {
        searchSessionSpans(filters, search);
      }
    },
    [searchSessionSpans, clearSearch]
  );

  const sessionStats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1 border-r">
      {/* Header */}
      <div className="flex flex-col gap-1.5 px-2 py-2 shrink-0">
        <div className="flex h-7 items-center justify-start gap-2">
          {sessionStats && <StatsShields stats={sessionStats} labelPrefix="Session" />}
          {traces.length > 0 && (
            <>
              <Button
                onClick={() => setSessionTimelineEnabled(!sessionTimelineEnabled)}
                variant="outline"
                className={cn(
                  "h-6 text-xs px-1.5",
                  sessionTimelineEnabled ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary"
                )}
              >
                <GanttChart size={14} className="mr-1" />
                Timeline
              </Button>
              <Button
                onClick={() => setMediaPanelOpen(!mediaPanelOpen)}
                variant="outline"
                className={cn(
                  "h-6 text-xs px-1.5",
                  mediaPanelOpen ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary"
                )}
              >
                <CirclePlay size={14} className="mr-1" />
                Media
              </Button>
            </>
          )}
        </div>
        {/* TODO(session-view): add autocomplete suggestions from loaded/matched spans */}
        <AdvancedSearch
          mode="state"
          filters={filterColumns}
          resource="spans"
          value={{ filters: [], search: "" }}
          onSubmit={handleSearch}
          placeholder="Search text, name, id, tags..."
          className="w-full"
          disabled={isTracesLoading}
          options={{ suggestions: new Map(), disableHotKey: true }}
        />
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
          {sessionTimelineEnabled && (
            <>
              <ResizablePanel defaultSize={120} minSize={80}>
                <div className="border-t h-full">
                  <SessionTimeline />
                </div>
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
