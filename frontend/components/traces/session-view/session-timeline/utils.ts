// TODO: The per-segment layout algorithm duplicates logic from
// trace-view/store/utils.ts (transformSpansToCondensedTimeline). Review for
// deduplication once the session timeline design stabilizes.

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type TraceRow } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionTimelineTraceBar {
  type: "trace";
  traceId: string;
  left: number; // percentage 0-100 within segment
  width: number; // percentage 0-100 within segment
  row: number;
  expanded: boolean;
}

export interface SessionTimelineSpanBar {
  type: "span";
  traceId: string;
  span: TraceViewSpan;
  left: number;
  width: number;
  row: number;
  color: string;
}

export type SessionTimelineElement = SessionTimelineTraceBar | SessionTimelineSpanBar;

export interface SessionTimelineSegmentData {
  elements: SessionTimelineElement[];
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  totalRows: number;
}

export interface SessionTimelineGapData {
  durationMs: number;
}

export type SessionTimelineSection =
  | { type: "segment"; segment: SessionTimelineSegmentData }
  | { type: "gap"; gap: SessionTimelineGapData };

export interface SessionTimelineSections {
  sections: SessionTimelineSection[];
  totalActiveDurationMs: number;
  /** Epoch ms of the very first trace in the session — used as the global time origin. */
  sessionStartMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Gaps larger than this are collapsed into a divider. */
export const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Fixed pixel width for gap dividers. */
export const GAP_WIDTH_PX = 48;

// ---------------------------------------------------------------------------
// Gap duration formatting
// ---------------------------------------------------------------------------

export function formatGapDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// ---------------------------------------------------------------------------
// Trace clustering
// ---------------------------------------------------------------------------

interface TraceCluster {
  traces: TraceRow[];
  startMs: number;
  endMs: number;
}

function clusterTraces(traces: TraceRow[]): TraceCluster[] {
  if (traces.length === 0) return [];

  const sorted = [...traces].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const clusters: TraceCluster[] = [];
  let current: TraceCluster = {
    traces: [sorted[0]],
    startMs: new Date(sorted[0].startTime).getTime(),
    endMs: new Date(sorted[0].endTime).getTime(),
  };

  for (let i = 1; i < sorted.length; i++) {
    const traceStartMs = new Date(sorted[i].startTime).getTime();
    const traceEndMs = new Date(sorted[i].endTime).getTime();

    if (traceStartMs - current.endMs > GAP_THRESHOLD_MS) {
      clusters.push(current);
      current = { traces: [sorted[i]], startMs: traceStartMs, endMs: traceEndMs };
    } else {
      current.traces.push(sorted[i]);
      current.endMs = Math.max(current.endMs, traceEndMs);
    }
  }
  clusters.push(current);

  return clusters;
}

// ---------------------------------------------------------------------------
// Per-segment layout (gravity packing)
// ---------------------------------------------------------------------------

type RowInterval = { left: number; right: number };

function computeSegmentLayout(
  traces: TraceRow[],
  traceSpans: Record<string, TraceViewSpan[]>,
  expandedTraceIds: Set<string>,
  segmentStartMs: number,
  segmentDurationMs: number
): { elements: SessionTimelineElement[]; totalRows: number } {
  // Percentages are relative to this (rounded up to nearest second).
  const upperIntervalMs = Math.max(Math.ceil(segmentDurationMs / 1000) * 1000, 1);

  // Shared row occupancy for the segment
  const rowOccupancy: RowInterval[][] = [];

  const hasOverlap = (row: number, left: number, right: number, height: number = 1): boolean => {
    for (let r = row; r < row + height; r++) {
      const slots = rowOccupancy[r];
      if (!slots) continue;
      for (const o of slots) {
        if (!(right <= o.left || left >= o.right)) return true;
      }
    }
    return false;
  };

  const occupy = (row: number, left: number, right: number, height: number = 1) => {
    for (let r = row; r < row + height; r++) {
      if (!rowOccupancy[r]) rowOccupancy[r] = [];
      rowOccupancy[r].push({ left, right });
    }
  };

  // --- Pass 1: Pack trace bars (2-row-tall) ---
  const traceBarData = traces
    .map((trace) => {
      const startMs = new Date(trace.startTime).getTime();
      const endMs = new Date(trace.endTime).getTime();
      return {
        traceId: trace.id,
        left: ((startMs - segmentStartMs) / upperIntervalMs) * 100,
        width: ((endMs - startMs) / upperIntervalMs) * 100,
      };
    })
    .sort((a, b) => a.left - b.left);

  const traceRowMap = new Map<string, number>();

  for (const bar of traceBarData) {
    const right = bar.left + bar.width;
    let row = 0;
    while (hasOverlap(row, bar.left, right, 2)) {
      row++;
    }
    traceRowMap.set(bar.traceId, row);
    occupy(row, bar.left, right, 2);
  }

  const elements: SessionTimelineElement[] = traceBarData.map((bar) => ({
    type: "trace" as const,
    traceId: bar.traceId,
    left: bar.left,
    width: bar.width,
    row: traceRowMap.get(bar.traceId)!,
    expanded: expandedTraceIds.has(bar.traceId),
  }));

  // --- Pass 2: Pack spans for expanded traces ---
  for (const trace of traces) {
    if (!expandedTraceIds.has(trace.id)) continue;
    const spans = traceSpans[trace.id];
    if (!spans || spans.length === 0) continue;

    const traceRow = traceRowMap.get(trace.id)!;
    const spanMinRow = traceRow + 2;

    const spanMap = new Map(spans.map((s) => [s.spanId, s]));
    const childSpansMap: Record<string, TraceViewSpan[]> = {};
    for (const span of spans) {
      if (span.parentSpanId) {
        if (!childSpansMap[span.parentSpanId]) childSpansMap[span.parentSpanId] = [];
        childSpansMap[span.parentSpanId].push(span);
      }
    }

    // DFS ordering
    const topLevelSpans = spans.filter((s) => !s.parentSpanId);
    const orderedSpans: TraceViewSpan[] = [];
    const visited = new Set<string>();
    const dfs = (spanId: string) => {
      if (visited.has(spanId)) return;
      visited.add(spanId);
      const span = spanMap.get(spanId);
      if (span) orderedSpans.push(span);
      for (const child of childSpansMap[spanId] || []) dfs(child.spanId);
    };
    for (const span of topLevelSpans) dfs(span.spanId);

    const spanRowMap = new Map<string, number>();

    for (const span of orderedSpans) {
      const spanStartMs = new Date(span.startTime).getTime();
      const spanEndMs = new Date(span.endTime).getTime();
      const left = ((spanStartMs - segmentStartMs) / upperIntervalMs) * 100;
      const width = ((spanEndMs - spanStartMs) / upperIntervalMs) * 100;
      const right = left + width;

      const parentRow = span.parentSpanId ? (spanRowMap.get(span.parentSpanId) ?? spanMinRow - 1) : spanMinRow - 1;
      const minRow = Math.max(spanMinRow, parentRow + 1);

      let targetRow = minRow;
      while (hasOverlap(targetRow, left, right)) {
        targetRow++;
      }

      spanRowMap.set(span.spanId, targetRow);
      occupy(targetRow, left, right);

      const color =
        span.status === "error"
          ? "rgba(204, 51, 51, 1)"
          : (SPAN_TYPE_TO_COLOR[span.spanType] ?? "rgba(96, 165, 250, 0.7)");

      elements.push({
        type: "span",
        traceId: trace.id,
        span,
        left,
        width,
        row: targetRow,
        color,
      });
    }
  }

  return { elements, totalRows: rowOccupancy.length };
}

// ---------------------------------------------------------------------------
// Top-level: cluster traces → segments + gaps
// ---------------------------------------------------------------------------

const EMPTY_SECTIONS: SessionTimelineSections = {
  sections: [],
  totalActiveDurationMs: 0,
  sessionStartMs: 0,
};

export function computeSessionTimelineSegments(
  traces: TraceRow[],
  traceSpans: Record<string, TraceViewSpan[]>,
  expandedTraceIds: Set<string>
): SessionTimelineSections {
  if (traces.length === 0) return EMPTY_SECTIONS;

  const clusters = clusterTraces(traces);
  const sections: SessionTimelineSection[] = [];
  let totalActiveDurationMs = 0;

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const durationMs = Math.max(cluster.endMs - cluster.startMs, 1);
    totalActiveDurationMs += durationMs;

    const { elements, totalRows } = computeSegmentLayout(
      cluster.traces,
      traceSpans,
      expandedTraceIds,
      cluster.startMs,
      durationMs
    );

    sections.push({
      type: "segment",
      segment: {
        elements,
        startTimeMs: cluster.startMs,
        endTimeMs: cluster.endMs,
        durationMs,
        totalRows,
      },
    });

    if (i < clusters.length - 1) {
      const gapMs = clusters[i + 1].startMs - cluster.endMs;
      sections.push({ type: "gap", gap: { durationMs: gapMs } });
    }
  }

  const sessionStartMs = clusters.length > 0 ? clusters[0].startMs : 0;
  return { sections, totalActiveDurationMs, sessionStartMs };
}
