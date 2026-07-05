"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useSessionSpanPreviews } from "@/components/traces/session-view/session-panel/use-session-span-previews";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import { formatDuration } from "@/lib/utils";

import NoteContent from "./note-content";
import { computeScoreDeltas, EvaluationCard } from "./session-evaluations";
import { textAnchorId } from "./session-outline/utils";
import { type SessionBlockView, useDebuggerSessionViewStore } from "./store";
import TraceSegment from "./trace-segment";

interface DebuggerTraceListProps {
  // The page-owned scroll container (shared with the outline and all segments).
  scrollEl: HTMLElement | null;
  projectId?: string;
  // Debug session id — interpolated into the LLM-span "Copy prompt" payload.
  sessionId?: string;
}

// A block paired with the running trace index (1-based, trace blocks only) so
// each TraceSegment can render its "run N of M" chrome.
type TimelineItem = { block: SessionBlockView; traceIndex: number };

const withTraceIndex = (blocks: SessionBlockView[]): TimelineItem[] => {
  let traceIndex = 0;
  return blocks.map((block) => ({ block, traceIndex: block.type === "trace" ? ++traceIndex : 0 }));
};

export default function DebuggerTraceList({ scrollEl, projectId, sessionId }: DebuggerTraceListProps) {
  // Blocks are the ordered timeline; traces/traceSpans hold the per-run data
  // that streams over realtime and feeds preview / IO batching.
  const blocks = useDebuggerSessionViewStore((s) => s.blocks);
  const { traces, traceSpans } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, traceSpans: s.traceSpans }),
    shallow
  );

  const tracesById = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);

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

  const items = useMemo(() => withTraceIndex(blocks), [blocks]);

  // Score deltas across evaluation blocks in timeline order, keyed by eval id.
  const scoreDeltasById = useMemo(
    () => computeScoreDeltas(blocks.flatMap((b) => (b.type === "evaluation" ? [b.evaluation] : []))),
    [blocks]
  );

  return (
    <div ref={columnRef} className="w-full">
      {items.map(({ block, traceIndex }, i) => {
        if (block.type === "text") {
          return (
            <div key={block.id} id={textAnchorId(block.id)} className="scroll-mt-4 px-1 py-5">
              <NoteContent content={block.text} />
            </div>
          );
        }
        if (block.type === "evaluation") {
          return (
            <div key={block.id} className="py-5">
              <EvaluationCard
                projectId={projectId ?? ""}
                evaluation={block.evaluation}
                scores={scoreDeltasById.get(block.evaluation.id) ?? []}
              />
            </div>
          );
        }
        const trace = tracesById.get(block.traceId);
        if (!trace) return null;
        const nextBlock = items[i + 1]?.block;
        const nextTrace = nextBlock?.type === "trace" ? tracesById.get(nextBlock.traceId) : undefined;
        // Gap divider only between two adjacent runs — other cells break the timeline visually already.
        const gapMs = nextTrace
          ? new Date(nextTrace.startTime).getTime() - new Date(trace.endTime).getTime()
          : undefined;
        return (
          <Fragment key={block.id}>
            <TraceSegment
              trace={trace}
              traceIndex={traceIndex}
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
            {nextTrace && (
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
