"use client";

import { AlertTriangle, ChevronDown, ChevronsRight, Copy } from "lucide-react";
import { useCallback, useMemo } from "react";
import { shallow } from "zustand/shallow";

import AdvancedSearch from "@/components/common/advanced-search";
import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import { filterColumns } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { type Filter } from "@/lib/actions/common/filters";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import SessionTimeline from "../session-timeline";
import SessionTimelineToggle from "../session-timeline/timeline-toggle";
import { useSessionViewStore } from "../store";
import SessionList from "./list";

interface SessionPanelProps {
  onClose: () => void;
}

/**
 * Shell around the session view — header (close, session-id dropdown),
 * advanced-search input, optional session timeline, stats shields. The
 * virtualized row list lives in `./list.tsx`.
 */
export default function SessionPanel({ onClose }: SessionPanelProps) {
  const { toast } = useToast();

  const {
    session,
    traces,
    isTracesLoading,
    tracesError,
    searchSessionSpans,
    clearSearch,
    sessionTimelineEnabled,
    setSessionTimelineEnabled,
  } = useSessionViewStore(
    (s) => ({
      session: s.session,
      traces: s.traces,
      isTracesLoading: s.isTracesLoading,
      tracesError: s.tracesError,
      searchSessionSpans: s.searchSessionSpans,
      clearSearch: s.clearSearch,
      sessionTimelineEnabled: s.sessionTimelineEnabled,
      setSessionTimelineEnabled: s.setSessionTimelineEnabled,
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

  const handleCopySessionId = async () => {
    if (!session?.sessionId) return;
    try {
      await navigator.clipboard.writeText(session.sessionId);
      toast({ title: "Copied session ID", duration: 1000 });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy session ID" });
    }
  };

  // Session aggregate stats — sessions-table gets these pre-aggregated from the
  // server, but here we only have the traces loaded, so sum them client-side.
  // Same shape/shield as `TraceStatsShields` for visual parity with trace view.
  const sessionStats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1 border-r">
      {/* Header (figma 3711:5056). Button/icon sizing mirrors
          `trace-view/header/index.tsx` and `trace-dropdown.tsx` for visual
          consistency across the two side panels. */}
      <div className="relative flex flex-col gap-1.5 px-2 py-1.5 shrink-0">
        <div className="flex h-7 items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            {/* Collapse / close side panel — matches trace-view: h-7 px-0.5 + w-5 h-5 icon */}
            <Button variant="ghost" className="h-7 px-0.5" onClick={onClose} aria-label="Close session view">
              <ChevronsRight className="w-5 h-5" />
            </Button>
            <span className="flex items-center h-7">
              <span className="text-base font-medium pl-2 flex-shrink-0">Session</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-6 px-1 hover:bg-secondary" disabled={!session?.sessionId}>
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleCopySessionId}>
                    <Copy size={14} />
                    Copy session ID
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
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
        {traces.length > 0 && (
          <SessionTimelineToggle enabled={sessionTimelineEnabled} setEnabled={setSessionTimelineEnabled} />
        )}
      </div>

      {/* Body */}
      {tracesError ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Session</h3>
          <p className="text-sm text-muted-foreground">{tracesError}</p>
        </div>
      ) : isTracesLoading && traces.length === 0 ? (
        <div className="flex flex-col gap-2 p-3">
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
              <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors hover:scale-200" />
            </>
          )}
          <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden relative">
            <div
              className={cn(
                "flex items-center gap-2 pb-2 border-b box-border transition-[padding] duration-200",
                sessionTimelineEnabled ? "pt-2 pl-2 pr-2" : "pt-0 pl-2 pr-[96px]"
              )}
            >
              {sessionStats && <StatsShields stats={sessionStats} labelPrefix="Session" />}
            </div>
            <SessionList />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
