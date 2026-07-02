"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { Response } from "@/components/ai-elements/response";
import { useSessionSpanPreviews } from "@/components/traces/session-view/session-panel/use-session-span-previews";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import { type SessionTextBlock } from "@/lib/actions/debugger-sessions";
import { type TraceRow } from "@/lib/traces/types";
import { cn, formatDuration } from "@/lib/utils";

import { noteMarkdownComponents, noteProseClassName } from "./note-markdown";
import TraceSegment from "./trace-segment";

interface DebuggerTraceListProps {
  // The page-owned scroll container (shared with the outline and all segments).
  scrollEl: HTMLElement | null;
  projectId?: string;
  // Debug session id — interpolated into the LLM-span "Copy prompt" payload.
  sessionId?: string;
  // Standalone `text` blocks, interleaved with the runs by time.
  textBlocks?: SessionTextBlock[];
}

// Runs and standalone text cells merged into one timeline (traces by
// startTime, text blocks by createdAt), oldest first.
type TimelineItem =
  | { kind: "trace"; trace: TraceRow; ms: number; traceIndex: number }
  | { kind: "text"; block: SessionTextBlock; ms: number };

const buildTimeline = (traces: TraceRow[], textBlocks: SessionTextBlock[]): TimelineItem[] => {
  const items: TimelineItem[] = [
    ...traces.map<TimelineItem>((trace) => ({
      kind: "trace",
      trace,
      ms: new Date(trace.startTime).getTime(),
      traceIndex: 0,
    })),
    ...textBlocks.map<TimelineItem>((block) => ({ kind: "text", block, ms: new Date(block.createdAt).getTime() })),
  ].sort((a, b) => a.ms - b.ms);
  let traceIndex = 0;
  for (const item of items) {
    if (item.kind === "trace") item.traceIndex = ++traceIndex;
  }
  return items;
};

export default function DebuggerTraceList({ scrollEl, projectId, sessionId, textBlocks = [] }: DebuggerTraceListProps) {
  const { traces, traceSpans } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, traceSpans: s.traceSpans }),
    shallow
  );

  // --- Layout version: bumped whenever the column's height changes (expand,
  // collapse, streaming, measurement settle) so every segment re-measures its
  // scrollMargin. Segments guard with a ±1px compare, so this converges.
  // ResizeObserver-driven scrollMargin re-measure is TanStack's documented
  // approach for multiple virtualizers in one scrolling element:
  // https://tanstack.com/virtual/latest/docs/api/virtualizer#scrollmargin ---
  const columnRef = useRef<HTMLDivElement>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setLayoutVersion((v) => v + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Preview fetching: segments report their visible span ids; we aggregate
  // and feed the same batched fetchers the flat list used. ---
  const [visibleAgg, setVisibleAgg] = useState<Record<string, { visible: string[]; inputs: string[] }>>({});
  const reportVisibleSpans = useCallback((traceId: string, visible: string[], inputs: string[]) => {
    setVisibleAgg((prev) => {
      const cur = prev[traceId];
      if (cur && cur.visible.join(",") === visible.join(",") && cur.inputs.join(",") === inputs.join(",")) return prev;
      if (!cur && visible.length === 0 && inputs.length === 0) return prev;
      return { ...prev, [traceId]: { visible, inputs } };
    });
  }, []);

  // Live trace-id set. A wholesale `setTraces` replace can drop ids while leaving a
  // stale visibleAgg entry behind, which would keep fetching previews for a
  // no-longer-displayed run (finding #5). Filter the CONSUMED maps by live ids
  // rather than pruning state in an effect (avoids a setState-in-effect cascade);
  // visibleAgg itself stays bounded by MAX_RUNS and re-fills when an id returns.
  const liveTraceIds = useMemo(() => new Set(traces.map((t) => t.id)), [traces]);

  const { visibleSpanIdsByTrace, inputSpanIdsByTrace } = useMemo(() => {
    const visible: Record<string, string[]> = {};
    const inputs: Record<string, string[]> = {};
    for (const [traceId, entry] of Object.entries(visibleAgg)) {
      if (!liveTraceIds.has(traceId)) continue;
      if (entry.visible.length > 0) visible[traceId] = entry.visible;
      if (entry.inputs.length > 0) inputs[traceId] = entry.inputs;
    }
    return { visibleSpanIdsByTrace: visible, inputSpanIdsByTrace: inputs };
  }, [visibleAgg, liveTraceIds]);

  const spanTypesByTrace = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [tid, spans] of Object.entries(traceSpans)) {
      const types: Record<string, string> = {};
      for (const s of spans) types[s.spanId] = s.spanType;
      out[tid] = types;
    }
    return out;
  }, [traceSpans]);

  const previewTraces = useMemo(
    () => traces.map((t) => ({ id: t.id, startTime: t.startTime, endTime: t.endTime })),
    [traces]
  );

  const { previews, userInputs, agentNames } = useSessionSpanPreviews({
    projectId,
    traces: previewTraces,
    visibleSpanIdsByTrace,
    inputSpanIdsByTrace,
    spanTypesByTrace,
  });

  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  const { previews: traceIO } = useBatchedTraceIO(projectId, traceIds);

  const timeline = useMemo(() => buildTimeline(traces, textBlocks), [traces, textBlocks]);

  return (
    <div ref={columnRef} className="w-full">
      {timeline.map((item, i) => {
        if (item.kind === "text") {
          return (
            <div key={item.block.id} className="px-1 py-5">
              <Response className={cn(noteProseClassName)} components={noteMarkdownComponents}>
                {item.block.note}
              </Response>
            </div>
          );
        }
        const { trace } = item;
        const next = timeline[i + 1];
        // Gap divider only between two adjacent runs — text cells break the timeline visually already.
        const gapMs =
          next?.kind === "trace"
            ? new Date(next.trace.startTime).getTime() - new Date(trace.endTime).getTime()
            : undefined;
        return (
          <Fragment key={trace.id}>
            <TraceSegment
              trace={trace}
              traceIndex={item.traceIndex}
              totalTraces={traces.length}
              scrollEl={scrollEl}
              sessionId={sessionId}
              layoutVersion={layoutVersion}
              reportVisibleSpans={reportVisibleSpans}
              previews={previews}
              userInputs={userInputs}
              agentNames={agentNames}
              traceIO={traceIO[trace.id]}
            />
            {next?.kind === "trace" && (
              <div className="px-2 flex h-20 items-center justify-center">
                <div className="w-full border-b" />
                {formatDuration(gapMs) && (
                  <span className="shrink-0 px-2 text-xs text-muted-foreground">{formatDuration(gapMs)}</span>
                )}
                <div className="w-full border-b" />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
