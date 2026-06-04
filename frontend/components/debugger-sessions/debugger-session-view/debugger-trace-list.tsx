"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useSessionSpanPreviews } from "@/components/traces/session-view/session-panel/use-session-span-previews";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { formatDuration } from "@/lib/utils";

import TraceSegment from "./trace-segment";

interface DebuggerTraceListProps {
  // The page-owned scroll container (shared with the outline and all segments).
  scrollEl: HTMLElement | null;
  projectId?: string;
  // Debug session id — interpolated into the LLM-span "Copy prompt" payload.
  sessionId?: string;
}

export default function DebuggerTraceList({ scrollEl, projectId, sessionId }: DebuggerTraceListProps) {
  const { traces, traceSpans } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, traceSpans: s.traceSpans }),
    shallow
  );

  // --- Layout version: bumped whenever the column's height changes (expand,
  // collapse, streaming, measurement settle) so every segment re-measures its
  // scrollMargin. Segments guard with a ±1px compare, so this converges. ---
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

  const allSpansById = useMemo(() => {
    const map = new Map<string, TraceViewSpan>();
    for (const spans of Object.values(traceSpans)) {
      for (const s of spans) map.set(s.spanId, s);
    }
    return map;
  }, [traceSpans]);

  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  const { previews: traceIO } = useBatchedTraceIO(projectId, traceIds);

  return (
    <div ref={columnRef} className="w-full">
      {traces.map((trace, i) => {
        const next = traces[i + 1];
        const gapMs = next ? new Date(next.startTime).getTime() - new Date(trace.endTime).getTime() : undefined;
        return (
          <Fragment key={trace.id}>
            <TraceSegment
              trace={trace}
              traceIndex={i + 1}
              totalTraces={traces.length}
              scrollEl={scrollEl}
              sessionId={sessionId}
              layoutVersion={layoutVersion}
              reportVisibleSpans={reportVisibleSpans}
              previews={previews}
              userInputs={userInputs}
              agentNames={agentNames}
              traceIO={traceIO[trace.id]}
              allSpansById={allSpansById}
            />
            {next && (
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
