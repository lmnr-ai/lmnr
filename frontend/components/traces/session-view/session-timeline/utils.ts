// TODO: The per-segment layout algorithm duplicates logic from
// trace-view/store/utils.ts (transformSpansToCondensedTimeline). Review for
// deduplication once the session timeline design stabilizes.

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type TraceRow } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A collapsed-state trace bar OR a pending-expand (loading) bar. */
export interface SessionTimelineTraceBar {
  type: "trace";
  traceId: string;
  left: number; // percentage 0-100 within segment
  width: number; // percentage 0-100 within segment
  row: number;
  /** True when the user clicked to expand but spans haven't arrived yet.
   *  Renders the bar with a shimmer pulse. Keeps the 2-row block geometry. */
  shimmer: boolean;
}

/** A span inside an expanded trace's container. Coordinates are
 *  TRACE-RELATIVE (% of the container's width), not segment-relative. */
export interface SessionTimelineContainerSpan {
  span: TraceViewSpan;
  left: number; // % of container width
  width: number; // % of container width
  row: number; // 0-based row within container
  color: string;
}

/** Expanded trace rendered as a bordered container holding its spans.
 *  Replaces the trace bar entirely when expanded + spans are loaded. */
export interface SessionTimelineSpanContainer {
  type: "span-container";
  traceId: string;
  left: number; // % of segment (matches underlying trace's time extent)
  width: number; // % of segment
  row: number; // starting row in segment
  rowHeight: number; // number of rows this container occupies (>= 2)
  spans: SessionTimelineContainerSpan[];
}

export type SessionTimelineElement = SessionTimelineTraceBar | SessionTimelineSpanContainer;

export interface SessionTimelineSegmentData {
  elements: SessionTimelineElement[];
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  /** Denominator used when positioning elements as % — duration rounded up to
   *  the next whole second (matches `upperIntervalMs` in the layout routine,
   *  which mirrors the condensed-timeline convention in trace-view). */
  widthMs: number;
  totalRows: number;
}

export interface SessionTimelineGapData {
  durationMs: number;
  /** Absolute ms time at the end of the previous cluster (= gap start). */
  startMs: number;
  /** Absolute ms time at the start of the next cluster (= gap end). */
  endMs: number;
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

/** Fixed pixel width for gap dividers INCLUDING the 8px gutters on each side.
 *  The gap component owns the gutters so they participate in the
 *  scroll-indicator highlight when the range straddles the gap. */
export const GAP_WIDTH_PX = 64;

/** Minimum block height (in rows) for both trace bars and empty/loading
 *  span containers. Matches the 2-row allocation used by the trace bar's
 *  14px visual within a 16px slot, for visual consistency across states. */
const MIN_BLOCK_ROWS = 2;

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
// Per-container span packing
// ---------------------------------------------------------------------------

/**
 * Pack a trace's spans inside its expanded container.
 *
 * Unlike the old algorithm, this is scoped entirely within the container:
 * horizontal coords are trace-relative (% of trace duration), and row
 * occupancy is local (starts at row 0). No segment-wide cross-contamination.
 *
 * DFS ordering from top-level spans + `parent.row + 1` constraint preserves
 * the nested-below-parent visual. Siblings greedily share rows when their
 * time ranges don't overlap.
 */
function packSpansInContainer(
  spans: TraceViewSpan[],
  trace: TraceRow
): { spans: SessionTimelineContainerSpan[]; rowCount: number } {
  if (spans.length === 0) return { spans: [], rowCount: 0 };

  const traceStartMs = new Date(trace.startTime).getTime();
  const traceEndMs = new Date(trace.endTime).getTime();
  const traceDurationMs = Math.max(traceEndMs - traceStartMs, 1);

  const spanMap = new Map(spans.map((s) => [s.spanId, s]));
  const childSpansMap: Record<string, TraceViewSpan[]> = {};
  for (const span of spans) {
    if (span.parentSpanId) {
      if (!childSpansMap[span.parentSpanId]) childSpansMap[span.parentSpanId] = [];
      childSpansMap[span.parentSpanId].push(span);
    }
  }

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

  const rowOccupancy: Array<Array<{ left: number; right: number }>> = [];
  const spanRowMap = new Map<string, number>();
  const result: SessionTimelineContainerSpan[] = [];

  const hasOverlap = (row: number, left: number, right: number): boolean => {
    const slots = rowOccupancy[row];
    if (!slots) return false;
    for (const o of slots) {
      if (!(right <= o.left || left >= o.right)) return true;
    }
    return false;
  };
  const occupy = (row: number, left: number, right: number) => {
    if (!rowOccupancy[row]) rowOccupancy[row] = [];
    rowOccupancy[row].push({ left, right });
  };

  for (const span of orderedSpans) {
    const spanStartMs = new Date(span.startTime).getTime();
    const spanEndMs = new Date(span.endTime).getTime();
    const left = ((spanStartMs - traceStartMs) / traceDurationMs) * 100;
    const width = ((spanEndMs - spanStartMs) / traceDurationMs) * 100;
    const right = left + width;

    const parentRow = span.parentSpanId ? (spanRowMap.get(span.parentSpanId) ?? -1) : -1;
    const minRow = Math.max(0, parentRow + 1);

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

    result.push({ span, left, width, row: targetRow, color });
  }

  return { spans: result, rowCount: rowOccupancy.length };
}

// ---------------------------------------------------------------------------
// Per-segment layout (gravity packing of variable-height blocks)
// ---------------------------------------------------------------------------

type RowInterval = { left: number; right: number };

function computeSegmentLayout(
  traces: TraceRow[],
  traceSpans: Record<string, TraceViewSpan[]>,
  traceSpansLoading: Record<string, boolean>,
  expandedTraceIds: Set<string>,
  segmentStartMs: number,
  segmentDurationMs: number
): { elements: SessionTimelineElement[]; totalRows: number } {
  // Percentages relative to this (rounded up to nearest second).
  const upperIntervalMs = Math.max(Math.ceil(segmentDurationMs / 1000) * 1000, 1);

  const rowOccupancy: RowInterval[][] = [];

  const hasOverlap = (row: number, left: number, right: number, height: number): boolean => {
    for (let r = row; r < row + height; r++) {
      const slots = rowOccupancy[r];
      if (!slots) continue;
      for (const o of slots) {
        if (!(right <= o.left || left >= o.right)) return true;
      }
    }
    return false;
  };

  const occupy = (row: number, left: number, right: number, height: number) => {
    for (let r = row; r < row + height; r++) {
      if (!rowOccupancy[r]) rowOccupancy[r] = [];
      rowOccupancy[r].push({ left, right });
    }
  };

  // --- Step 1: build one block descriptor per trace. ---
  // Each block has an x-extent (from trace time) and a height (in rows).
  // Blocks are the unit of vertical packing — a trace's spans NEVER share
  // vertical space with another trace's block, so overlapping traces stack
  // cleanly (per the "x-axis is time, no y-overlap" invariant).
  type Block = {
    trace: TraceRow;
    left: number;
    width: number;
    height: number;
    // Rendered element for this block (without `row` yet — assigned below).
    render:
      | { type: "trace"; shimmer: boolean }
      | { type: "span-container"; rowHeight: number; spans: SessionTimelineContainerSpan[] };
  };

  const blocks: Block[] = traces
    .map<Block>((trace) => {
      const startMs = new Date(trace.startTime).getTime();
      const endMs = new Date(trace.endTime).getTime();
      const left = ((startMs - segmentStartMs) / upperIntervalMs) * 100;
      const width = ((endMs - startMs) / upperIntervalMs) * 100;

      const isExpanded = expandedTraceIds.has(trace.id);
      const spans = traceSpans[trace.id];
      const isLoading = !!traceSpansLoading[trace.id];

      // Expanded + spans loaded → render as span container.
      // Everything else → render as trace bar (shimmer if loading in-flight).
      //
      // With two-phase expansion in `index.tsx`, `isExpanded` only flips to
      // true AFTER spans arrive (or error). The "expanded && !spans" branch
      // is defensive — falls back to trace bar so layout doesn't break.
      if (isExpanded && spans) {
        const packed = packSpansInContainer(spans, trace);
        const rowHeight = Math.max(packed.rowCount, MIN_BLOCK_ROWS);
        return {
          trace,
          left,
          width,
          height: rowHeight,
          render: { type: "span-container", rowHeight, spans: packed.spans },
        };
      }

      const shimmer = isLoading && !spans;
      return {
        trace,
        left,
        width,
        height: MIN_BLOCK_ROWS,
        render: { type: "trace", shimmer },
      };
    })
    .sort((a, b) => a.left - b.left);

  // --- Step 2: gravity-pack blocks. Each block finds the lowest row where
  //     it doesn't x-overlap any already-placed block across its full height. ---
  const elements: SessionTimelineElement[] = [];

  for (const block of blocks) {
    const right = block.left + block.width;
    let row = 0;
    while (hasOverlap(row, block.left, right, block.height)) {
      row++;
    }
    occupy(row, block.left, right, block.height);

    if (block.render.type === "trace") {
      elements.push({
        type: "trace",
        traceId: block.trace.id,
        left: block.left,
        width: block.width,
        row,
        shimmer: block.render.shimmer,
      });
    } else {
      elements.push({
        type: "span-container",
        traceId: block.trace.id,
        left: block.left,
        width: block.width,
        row,
        rowHeight: block.render.rowHeight,
        spans: block.render.spans,
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
  traceSpansLoading: Record<string, boolean>,
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
      traceSpansLoading,
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
        widthMs: Math.max(Math.ceil(durationMs / 1000) * 1000, 1),
        totalRows,
      },
    });

    if (i < clusters.length - 1) {
      const gapMs = clusters[i + 1].startMs - cluster.endMs;
      sections.push({
        type: "gap",
        gap: { durationMs: gapMs, startMs: cluster.endMs, endMs: clusters[i + 1].startMs },
      });
    }
  }

  const sessionStartMs = clusters.length > 0 ? clusters[0].startMs : 0;
  return { sections, totalActiveDurationMs, sessionStartMs };
}
