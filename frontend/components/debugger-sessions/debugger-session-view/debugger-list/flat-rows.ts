import { computeTranscriptEntries } from "@/components/traces/session-view/utils";
import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TranscriptListGroup,
} from "@/components/traces/trace-view/store/base";
import { computePathInfoMap, transformSpansToTree } from "@/components/traces/trace-view/store/utils";
import { type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
import { SpanType, type TraceRow } from "@/lib/traces/types";

import { type SessionBlockView, type TraceRowState } from "../store";

// A block paired with its 1-based trace index (trace blocks only) for "run N of M".
export type TimelineItem = { block: SessionBlockView; traceIndex: number };

export const withTraceIndex = (blocks: SessionBlockView[]): TimelineItem[] => {
  let traceIndex = 0;
  return blocks.map((block) => ({ block, traceIndex: block.type === "trace" ? ++traceIndex : 0 }));
};

// One virtualized row. Every row carries the owning `blockId` so the outline can
// map scroll position ↔ block. Trace rows also carry `traceId`.
export type DebuggerFlatRow =
  | { type: "text"; blockId: string; text: string }
  | { type: "evaluation"; blockId: string; evaluation: SessionEvaluationRef; createdAt: string }
  | { type: "trace-skeleton"; blockId: string; traceId: string }
  | { type: "trace-header"; blockId: string; traceId: string; trace: TraceRow; traceIndex: number; expanded: boolean }
  | { type: "trace-collapsed-body"; blockId: string; traceId: string; trace: TraceRow }
  | { type: "trace-loading"; blockId: string; traceId: string }
  | { type: "trace-error"; blockId: string; traceId: string; error: string }
  | { type: "trace-empty"; blockId: string; traceId: string }
  | { type: "user-input"; blockId: string; traceId: string }
  | { type: "span"; blockId: string; traceId: string; span: TraceViewListSpan }
  | { type: "group-header"; blockId: string; traceId: string; group: TranscriptListGroup; collapsed: boolean }
  | { type: "group-span"; blockId: string; traceId: string; span: TraceViewListSpan; isLast: boolean }
  | {
      type: "tree-span";
      blockId: string;
      traceId: string;
      span: TraceViewSpan;
      depth: number;
      branchMask: boolean[];
      hasChildren: boolean;
    }
  | { type: "trace-divider"; blockId: string; gapMs?: number };

interface BuildDebuggerFlatRowsOpts {
  items: TimelineItem[];
  tracesById: Map<string, TraceRow>;
  traceRowStates: Record<string, TraceRowState>;
  traceSpans: Record<string, TraceViewSpan[]>;
  traceSpansFetching: Record<string, boolean>;
  traceSpansError: Record<string, string | undefined>;
  expandedTraceIds: Set<string>;
  transcriptExpandedGroups: Set<string>;
  traceViewModes: Record<string, "tree" | "transcript">;
}

// Flatten the interleaved block timeline into virtualizer rows. A single pass so
// one virtualizer drives the whole timeline (headers stay sticky per trace, spans
// stream in, eval/text blocks sit inline). A trace block emits: header → body OR
// (user-input + span/group/tree rows) → divider-to-next-run. Not-yet-loaded trace
// blocks emit a skeleton row (so the window still requests them); `missing` ones
// emit nothing.
export function buildDebuggerFlatRows(opts: BuildDebuggerFlatRowsOpts): DebuggerFlatRow[] {
  const {
    items,
    tracesById,
    traceRowStates,
    traceSpans,
    traceSpansFetching,
    traceSpansError,
    expandedTraceIds,
    transcriptExpandedGroups,
    traceViewModes,
  } = opts;

  const rows: DebuggerFlatRow[] = [];

  for (let i = 0; i < items.length; i++) {
    const { block, traceIndex } = items[i];

    if (block.type === "text") {
      rows.push({ type: "text", blockId: block.id, text: block.text });
      continue;
    }
    if (block.type === "evaluation") {
      rows.push({ type: "evaluation", blockId: block.id, evaluation: block.evaluation, createdAt: block.createdAt });
      continue;
    }

    // trace block
    const traceId = block.traceId;
    const trace = tracesById.get(traceId);
    if (!trace) {
      // Server confirmed absent → drop it; otherwise skeleton (also what makes the
      // window request it via ensureTraceRows).
      if (traceRowStates[traceId] !== "missing") {
        rows.push({ type: "trace-skeleton", blockId: block.id, traceId });
      }
      continue;
    }

    const expanded = expandedTraceIds.has(traceId);
    rows.push({ type: "trace-header", blockId: block.id, traceId, trace, traceIndex, expanded });

    if (!expanded) {
      rows.push({ type: "trace-collapsed-body", blockId: block.id, traceId, trace });
    } else {
      const error = traceSpansError[traceId];
      const spans = traceSpans[traceId];
      const fetching = !!traceSpansFetching[traceId];
      if (error) {
        rows.push({ type: "trace-error", blockId: block.id, traceId, error });
      } else if (!spans || spans.length === 0) {
        rows.push(
          !spans || fetching
            ? { type: "trace-loading", blockId: block.id, traceId }
            : { type: "trace-empty", blockId: block.id, traceId }
        );
      } else {
        rows.push({ type: "user-input", blockId: block.id, traceId });
        appendSpanRows(
          rows,
          block.id,
          traceId,
          spans,
          traceViewModes[traceId] ?? "transcript",
          transcriptExpandedGroups
        );
      }
    }

    // Gap divider between consecutive runs (only when THIS run is loaded, matching
    // the old per-cell divider). Duration shown once the next run's row loads.
    const nextBlock = items[i + 1]?.block;
    if (nextBlock?.type === "trace") {
      const nextTrace = tracesById.get(nextBlock.traceId);
      const gapMs = nextTrace ? new Date(nextTrace.startTime).getTime() - new Date(trace.endTime).getTime() : undefined;
      rows.push({ type: "trace-divider", blockId: block.id, gapMs });
    }
  }

  return rows;
}

function appendSpanRows(
  rows: DebuggerFlatRow[],
  blockId: string,
  traceId: string,
  spans: TraceViewSpan[],
  mode: "tree" | "transcript",
  transcriptExpandedGroups: Set<string>
): void {
  if (mode === "tree") {
    const pathInfoMap = computePathInfoMap(spans);
    for (const ts of transformSpansToTree(spans, pathInfoMap)) {
      rows.push({
        type: "tree-span",
        blockId,
        traceId,
        span: ts.span,
        depth: ts.depth,
        branchMask: ts.branchMask,
        hasChildren: ts.hasChildren,
      });
    }
    return;
  }

  const entries = computeTranscriptEntries(spans);
  for (const entry of entries) {
    if (entry.type === "span") {
      rows.push({ type: "span", blockId, traceId, span: entry.span });
    } else if (entry.type === "group") {
      const collapsed = !transcriptExpandedGroups.has(`${traceId}::${entry.groupId}`);
      rows.push({ type: "group-header", blockId, traceId, group: entry, collapsed });
      if (!collapsed) {
        const children = entries.filter((e) => e.type === "group-span" && e.groupId === entry.groupId);
        children.forEach((child, idx) => {
          if (child.type === "group-span") {
            rows.push({ type: "group-span", blockId, traceId, span: child.span, isLast: idx === children.length - 1 });
          }
        });
      }
    }
  }
}

// A stable virtualizer key per row (lets TanStack track measurements across
// expand/collapse index shifts).
export const flatRowKey = (row: DebuggerFlatRow): string => {
  switch (row.type) {
    case "text":
      return `x::${row.blockId}`;
    case "evaluation":
      return `e::${row.blockId}`;
    case "trace-skeleton":
      return `sk::${row.traceId}`;
    case "trace-header":
      return `th::${row.traceId}`;
    case "trace-collapsed-body":
      return `tcb::${row.traceId}`;
    case "trace-loading":
      return `tl::${row.traceId}`;
    case "trace-error":
      return `terr::${row.traceId}`;
    case "trace-empty":
      return `tempty::${row.traceId}`;
    case "user-input":
      return `ui::${row.traceId}`;
    case "span":
      return `sp::${row.traceId}::${row.span.spanId}`;
    case "group-header":
      return `gh::${row.traceId}::${row.group.groupId}`;
    case "group-span":
      return `gs::${row.traceId}::${row.span.spanId}`;
    case "tree-span":
      return `ts::${row.traceId}::${row.span.spanId}`;
    case "trace-divider":
      return `div::${row.blockId}`;
  }
};

// Per-row-type initial height estimate (near median rendered heights so measure
// re-anchors less).
export const flatRowEstimate = (row: DebuggerFlatRow, showTreeContent: boolean): number => {
  switch (row.type) {
    case "trace-header":
      return 44;
    case "trace-collapsed-body":
      return 240;
    case "trace-skeleton":
      return 120;
    case "trace-loading":
      return 90;
    case "trace-error":
    case "trace-empty":
      return 42;
    case "group-header":
      return 36;
    case "tree-span":
      return showTreeContent ? 56 : 36;
    case "trace-divider":
      return 80;
    case "text":
      return 180;
    case "evaluation":
      return 200;
    case "user-input":
    case "span":
    case "group-span":
      return 70;
  }
};

// Paste-to-agent prompt for "cache and rerun from here"; the SDK resolves
// LMNR_DEBUG_CACHE_UNTIL from a span id directly.
const rerunPrompt = (traceId: string, spanId: string, sessionId?: string) =>
  [
    "Rerun the agent with these env vars:",
    "LMNR_DEBUG=true",
    ...(sessionId ? [`LMNR_DEBUG_SESSION_ID=${sessionId}`] : []),
    `LMNR_DEBUG_REPLAY_TRACE_ID=${traceId}`,
    `LMNR_DEBUG_CACHE_UNTIL=${spanId}`,
  ].join("\n");

// LLM spans get the "cache and rerun" prompt flag; every other span type gets the
// plain Copy-span-ID flag.
export const spanFlagProps = (span: TraceViewListSpan, traceId: string, sessionId?: string) =>
  span.spanType === SpanType.LLM
    ? {
        label: "Copy prompt",
        toastTitle: "Copied rerun prompt",
        description: "Cache and rerun from here",
        value: rerunPrompt(traceId, span.spanId, sessionId),
      }
    : { label: "Copy span ID", toastTitle: "Copied span ID", value: span.spanId };
