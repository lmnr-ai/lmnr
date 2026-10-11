"use client";

import { CirclePlay, GanttChart, Radio } from "lucide-react";
import { shallow } from "zustand/shallow";

import { TraceStatsShields } from "@/components/traces/stats-shields";
import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StatsRowProps {
  trace: TraceViewTrace;
  spans?: TraceViewSpan[];
  hasLangGraph: boolean;
  className?: string;
}

const PILL = "flex h-6 shrink-0 items-center bg-surface-up-2 px-1.5 hover:bg-surface-up-4 active:bg-surface-up-5";
const PILL_ACTIVE = "text-primary hover:text-primary";

// Flat, left-aligned strip that wraps on narrow widths; no right-anchored group.
export default function StatsRow({ trace, spans, hasLangGraph, className }: StatsRowProps) {
  const {
    traceSignals,
    signalsPanelOpen,
    setSignalsPanelOpen,
    hasBrowserSession,
    browserSession,
    setBrowserSession,
    langGraph,
    setLangGraph,
    condensedTimelineEnabled,
    setCondensedTimelineEnabled,
  } = useTraceViewStore(
    (state) => ({
      traceSignals: state.traceSignals,
      signalsPanelOpen: state.signalsPanelOpen,
      setSignalsPanelOpen: state.setSignalsPanelOpen,
      hasBrowserSession: state.hasBrowserSession,
      browserSession: state.browserSession,
      setBrowserSession: state.setBrowserSession,
      langGraph: state.langGraph,
      setLangGraph: state.setLangGraph,
      condensedTimelineEnabled: state.condensedTimelineEnabled,
      setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
    }),
    shallow
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b px-2 pb-2 overflow-hidden", className)}>
      <ViewDropdown tabs={["tree", "transcript"]} />
      <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} spans={spans} />
      {traceSignals.length > 0 && (
        <Button
          variant="ghost"
          className={cn(PILL, signalsPanelOpen && PILL_ACTIVE)}
          onClick={() => setSignalsPanelOpen(!signalsPanelOpen)}
        >
          <Radio data-icon="inline-start" size={14} className="flex-shrink-0" />
          <span className="ml-1">Signals ({traceSignals.length})</span>
        </Button>
      )}
      {hasBrowserSession && (
        <Button
          variant="ghost"
          className={cn(PILL, browserSession && PILL_ACTIVE)}
          onClick={() => setBrowserSession(!browserSession)}
        >
          <CirclePlay data-icon="inline-start" size={14} className="flex-shrink-0" />
          <span className="ml-1">Media</span>
        </Button>
      )}
      {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
      {!condensedTimelineEnabled && (
        <Button variant="ghost" className={PILL} onClick={() => setCondensedTimelineEnabled(true)}>
          <GanttChart data-icon="inline-start" size={14} className="flex-shrink-0" />
          <span className="ml-1">Timeline</span>
        </Button>
      )}
    </div>
  );
}
