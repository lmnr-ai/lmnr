import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/store";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type TraceRow } from "@/lib/traces/types";

export interface TimelineDeps {
  loadTraceSpans: (trace: TraceRow) => Promise<{ spans: TraceViewSpan[] } | { error: string }>;
}

/** The session timeline above the thread: on/off, zoom, which turns are expanded into spans, and what's in view. */
export interface TimelineSlice {
  timelineEnabled: boolean;
  timelineZoom: number;
  /** Spans per trace, loaded the first time a turn is expanded and reloaded once its end time moves. */
  traceSpans: Record<string, TraceViewSpan[]>;
  /** The trace end time each `traceSpans` entry was loaded for. */
  traceSpansEndTime: Record<string, string>;
  traceSpansLoading: Record<string, boolean>;
  traceSpansError: Record<string, string | undefined>;
  expandedTraceIds: Set<string>;
  /** Absolute-ms range the thread's on-screen turns cover; drawn as the timeline's "in view" band. */
  visibleRange?: { start: number; end: number };

  setTimelineEnabled: (enabled: boolean) => void;
  setTimelineZoom: (zoom: number) => void;
  fetchTraceSpans: (trace: TraceRow) => Promise<void>;
  toggleTraceExpanded: (traceId: string) => void;
  setTraceExpanded: (traceId: string, expanded: boolean) => void;
  setVisibleRange: (start?: number, end?: number) => void;
}

export const createTimelineSlice =
  ({ loadTraceSpans }: TimelineDeps) =>
  (set: (partial: Partial<TimelineSlice>) => void, get: () => TimelineSlice): TimelineSlice => {
    // Expanding needs the trace's spans; the timeline loads them (`fetchTraceSpans`) before it expands.
    const setExpanded = (traceId: string, expanded: boolean) => {
      const next = new Set(get().expandedTraceIds);
      if (expanded) next.add(traceId);
      else next.delete(traceId);
      set({ expandedTraceIds: next });
    };

    return {
      timelineEnabled: false,
      timelineZoom: 1,
      traceSpans: {},
      traceSpansEndTime: {},
      traceSpansLoading: {},
      traceSpansError: {},
      expandedTraceIds: new Set(),

      setTimelineEnabled: (timelineEnabled) => set({ timelineEnabled }),
      setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),

      fetchTraceSpans: async (trace) => {
        const { traceSpans, traceSpansEndTime, traceSpansLoading } = get();
        const current = traceSpans[trace.id] && traceSpansEndTime[trace.id] === trace.endTime;
        if (current || traceSpansLoading[trace.id]) return;
        set({
          traceSpansLoading: { ...traceSpansLoading, [trace.id]: true },
          traceSpansError: { ...get().traceSpansError, [trace.id]: undefined },
        });
        const result = await loadTraceSpans(trace);
        set({ traceSpansLoading: { ...get().traceSpansLoading, [trace.id]: false } });
        if ("error" in result) set({ traceSpansError: { ...get().traceSpansError, [trace.id]: result.error } });
        else
          set({
            traceSpans: { ...get().traceSpans, [trace.id]: result.spans },
            traceSpansEndTime: { ...get().traceSpansEndTime, [trace.id]: trace.endTime },
          });
      },

      toggleTraceExpanded: (traceId) => setExpanded(traceId, !get().expandedTraceIds.has(traceId)),
      setTraceExpanded: (traceId, expanded) => {
        if (expanded !== get().expandedTraceIds.has(traceId)) setExpanded(traceId, expanded);
      },

      setVisibleRange: (start, end) =>
        set({ visibleRange: start === undefined || end === undefined ? undefined : { start, end } }),
    };
  };
