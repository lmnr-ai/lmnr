import { computeTranscriptEntries } from "@/components/traces/session-view/utils";
import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TranscriptListGroup,
} from "@/components/traces/trace-view/store/base";
import { computePathInfoMap, transformSpansToTree } from "@/components/traces/trace-view/store/utils";
import { type CommandBlockContent, type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
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
// A single command inside a collapsed command-group card.
export type CommandGroupItem = { id: string; createdAt: string; command: CommandBlockContent };

export type DebuggerFlatRow =
  | { type: "text"; blockId: string; text: string }
  | { type: "command"; blockId: string; createdAt: string; command: CommandBlockContent }
  // ≥2 contiguous command blocks collapse into a group, flattened into the
  // virtualizer exactly like a trace's header + spans: a self-contained rounded
  // header card, then (when expanded) borderless bead rows flowing below on a
  // vertical connector line — NOT one continuous bordered card. Each row measures
  // independently (no inline-expand reflow bug) and the header never goes sticky.
  // `blockId` on every group row is the first command's id (matching the
  // outline's group row) so scroll targeting agrees.
  | { type: "command-group-header"; blockId: string; count: number; lastCreatedAt: string; expanded: boolean }
  // `isFirst`/`isLast` shape the connector line: the first bead's line reaches UP
  // to the header, the last bead's line stops AT the bead (no dangling segment
  // below it). `isLastRow` on a detail means it is the group's final row, so its
  // line is suppressed (nothing below to connect to).
  | {
      type: "command-item";
      blockId: string;
      commandId: string;
      command: CommandBlockContent;
      createdAt: string;
      expanded: boolean;
      isFirst: boolean;
      isLast: boolean;
    }
  | {
      type: "command-item-detail";
      blockId: string;
      commandId: string;
      command: CommandBlockContent;
      isLastRow: boolean;
    }
  | { type: "evaluation"; blockId: string; evaluation: SessionEvaluationRef; createdAt: string }
  | { type: "trace-skeleton"; blockId: string; traceId: string }
  | { type: "trace-header"; blockId: string; traceId: string; trace: TraceRow; traceIndex: number; expanded: boolean }
  | { type: "trace-collapsed-body"; blockId: string; traceId: string; trace: TraceRow }
  | { type: "trace-loading"; blockId: string; traceId: string }
  | { type: "trace-error"; blockId: string; traceId: string; error: string }
  | { type: "trace-empty"; blockId: string; traceId: string }
  | { type: "user-input"; blockId: string; traceId: string; trace: TraceRow }
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
  expandedCommandGroupIds: Set<string>;
  expandedCommandBlockIds: Set<string>;
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
    expandedCommandGroupIds,
    expandedCommandBlockIds,
  } = opts;

  const rows: DebuggerFlatRow[] = [];

  // Accumulate a run of contiguous command blocks; flush as one command-group
  // card (≥2) or a single command block (1). Mirrors the outline's grouping so
  // the two agree on membership and scroll targets. A ≥2 run flattens to a
  // header row plus (when the group is expanded) a bead row per command and a
  // detail row per expanded command — one virtualizer row each.
  let pendingCommands: CommandGroupItem[] = [];
  const flushCommands = () => {
    if (pendingCommands.length === 0) return;
    if (pendingCommands.length >= 2) {
      const groupId = pendingCommands[0].id;
      const groupExpanded = expandedCommandGroupIds.has(groupId);
      rows.push({
        type: "command-group-header",
        blockId: groupId,
        count: pendingCommands.length,
        lastCreatedAt: pendingCommands[pendingCommands.length - 1].createdAt,
        expanded: groupExpanded,
      });
      if (groupExpanded) {
        pendingCommands.forEach((c, idx) => {
          const isLast = idx === pendingCommands.length - 1;
          const cmdExpanded = expandedCommandBlockIds.has(c.id);
          rows.push({
            type: "command-item",
            blockId: groupId,
            commandId: c.id,
            command: c.command,
            createdAt: c.createdAt,
            expanded: cmdExpanded,
            isFirst: idx === 0,
            isLast,
          });
          if (cmdExpanded) {
            rows.push({
              type: "command-item-detail",
              blockId: groupId,
              commandId: c.id,
              command: c.command,
              isLastRow: isLast,
            });
          }
        });
      }
    } else {
      const only = pendingCommands[0];
      rows.push({ type: "command", blockId: only.id, createdAt: only.createdAt, command: only.command });
    }
    pendingCommands = [];
  };

  for (let i = 0; i < items.length; i++) {
    const { block, traceIndex } = items[i];

    if (block.type === "command") {
      pendingCommands.push({ id: block.id, createdAt: block.createdAt, command: block.command });
      continue;
    }

    // A missing trace renders no row AND is transparent to a command run — it
    // neither flushes nor breaks the group (matching the outline). Caught before
    // the flush below; every OTHER block ends the run before its own row(s).
    if (block.type === "trace" && !tracesById.get(block.traceId) && traceRowStates[block.traceId] === "missing") {
      continue;
    }

    flushCommands();

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
      // Not yet loaded (missing was handled above) → skeleton, which also makes
      // the window request it via ensureTraceRows.
      rows.push({ type: "trace-skeleton", blockId: block.id, traceId });
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
        rows.push({ type: "user-input", blockId: block.id, traceId, trace });
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

  flushCommands();
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
    case "command":
      return `c::${row.blockId}`;
    case "command-group-header":
      return `cgh::${row.blockId}`;
    case "command-item":
      return `ci::${row.commandId}`;
    case "command-item-detail":
      return `cid::${row.commandId}`;
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
    // Collapsed one-liner; expanding re-measures via measureElement.
    case "command":
    case "command-group-header":
      return 48;
    // Bead row (one line); detail card re-measures via measureElement.
    case "command-item":
      return 34;
    case "command-item-detail":
      return 200;
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
