import { computeTranscriptEntries } from "@/components/traces/session-view/utils";
import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TranscriptListGroup,
} from "@/components/traces/trace-view/store/base";
import { computePathInfoMap, transformSpansToTree } from "@/components/traces/trace-view/store/utils";
import { type CommandBlockContent, type SessionEvaluationRef } from "@/lib/actions/debugger-sessions";
import { SpanType, type TraceRow } from "@/lib/traces/types";

import { isRunTransparentBlock, type SessionBlockView, type TraceRowState } from "../store";

// The one inter-block spacing unit (px) — the single density knob for the whole
// timeline. Spacing between top-level blocks is owned by dedicated seam rows (see
// buildDebuggerFlatRows), never by per-block padding, so blocks stay spacing-
// agnostic and gaps can never double up. Bump this to loosen/tighten everything.
export const SEAM = 32;

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
  // A contiguous command run (even one command) collapses into a group, flattened into the
  // virtualizer exactly like a trace's header + spans: a self-contained rounded
  // header card, then (when expanded) borderless bead rows flowing below on a
  // vertical connector line — NOT one continuous bordered card. Each row measures
  // independently (no inline-expand reflow bug) and the header never goes sticky.
  // `blockId` on every group row is the first command's id (matching the
  // outline's group row) so scroll targeting agrees. A run of ONE skips the
  // header entirely (see emitCommands) — it renders as a bare command row.
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
  // A seam OWNS the space between two top-level blocks (blocks carry no vertical
  // padding of their own). `divider` sits between two timeline blocks (trace /
  // eval / command) and shows the elapsed-time gap; `spacer` is the plain SEAM
  // gap used wherever a text block is on either side. `blockId` is the PREVIOUS
  // block's id so the seam never claims the next block's outline first-index.
  | { type: "seam"; blockId: string; variant: "divider" | "spacer"; gapMs?: number };

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

// One top-level block as the user perceives it, after collapsing a contiguous
// command run into a single unit. Carries just enough to emit its rows and to
// compute its start/end time for seam gaps; `text` has no time (never a divider).
type VisibleBlock =
  | { kind: "trace"; blockId: string; traceId: string; traceIndex: number }
  | { kind: "eval"; blockId: string; evaluation: SessionEvaluationRef; createdAt: string }
  | { kind: "text"; blockId: string; text: string }
  | { kind: "commands"; blockId: string; commands: CommandGroupItem[] };

// Flatten the interleaved block timeline into virtualizer rows. Two phases:
//   1. Reduce raw items to VisibleBlocks (contiguous commands → one unit; missing
//      traces skipped and transparent to a command run).
//   2. Emit each block's rows, inserting ONE seam row between adjacent blocks:
//      timeline↔timeline → an elapsed-time divider, anything touching text → a
//      plain spacer. Blocks own no vertical padding — the seam owns all spacing,
//      so gaps are uniform and can never double up.
// Not-yet-loaded trace blocks emit a skeleton row (so the window still requests
// them via ensureTraceRows).
export function buildDebuggerFlatRows(opts: BuildDebuggerFlatRowsOpts): DebuggerFlatRow[] {
  // Phase 1 only needs these three; the rest of opts is threaded into the
  // per-block emit helpers below.
  const { items, tracesById, traceRowStates } = opts;

  // --- Phase 1: raw items → visible blocks ---
  const visible: VisibleBlock[] = [];
  let pendingCommands: CommandGroupItem[] = [];
  const flushCommands = () => {
    if (pendingCommands.length === 0) return;
    visible.push({ kind: "commands", blockId: pendingCommands[0].id, commands: pendingCommands });
    pendingCommands = [];
  };
  for (const { block, traceIndex } of items) {
    if (block.type === "command") {
      pendingCommands.push({ id: block.id, createdAt: block.createdAt, command: block.command });
      continue;
    }
    // A missing trace renders nothing AND is transparent to a command run — it
    // neither flushes nor breaks it (matching the outline's grouping).
    if (isRunTransparentBlock(block, tracesById, traceRowStates)) {
      continue;
    }
    flushCommands();
    if (block.type === "text") visible.push({ kind: "text", blockId: block.id, text: block.text });
    else if (block.type === "evaluation")
      visible.push({ kind: "eval", blockId: block.id, evaluation: block.evaluation, createdAt: block.createdAt });
    else visible.push({ kind: "trace", blockId: block.id, traceId: block.traceId, traceIndex });
  }
  flushCommands();

  // --- Phase 2: emit block rows + the seams between them ---
  const rows: DebuggerFlatRow[] = [];
  visible.forEach((vb, i) => {
    if (i > 0) emitSeam(rows, visible[i - 1], vb, tracesById);
    emitBlock(rows, vb, opts);
  });
  return rows;
}

// Epoch ms for a date string, or undefined if absent/unparseable.
const toMs = (iso?: string): number | undefined => {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? undefined : t;
};

const blockStartMs = (vb: VisibleBlock, tracesById: Map<string, TraceRow>): number | undefined => {
  switch (vb.kind) {
    case "trace":
      return toMs(tracesById.get(vb.traceId)?.startTime);
    case "eval":
      return toMs(vb.createdAt);
    case "commands":
      return toMs(vb.commands[0].createdAt);
    case "text":
      return undefined;
  }
};

const blockEndMs = (vb: VisibleBlock, tracesById: Map<string, TraceRow>): number | undefined => {
  switch (vb.kind) {
    case "trace":
      return toMs(tracesById.get(vb.traceId)?.endTime);
    case "eval":
      return toMs(vb.createdAt);
    case "commands":
      return toMs(vb.commands[vb.commands.length - 1].createdAt);
    case "text":
      return undefined;
  }
};

// A seam between two timeline blocks is an elapsed-time divider; any seam touching
// a text block is a plain spacer. `blockId` = previous block's id (see the row type).
function emitSeam(
  rows: DebuggerFlatRow[],
  prev: VisibleBlock,
  cur: VisibleBlock,
  tracesById: Map<string, TraceRow>
): void {
  if (prev.kind !== "text" && cur.kind !== "text") {
    const start = blockStartMs(cur, tracesById);
    const end = blockEndMs(prev, tracesById);
    const gapMs = start !== undefined && end !== undefined && start > end ? start - end : undefined;
    rows.push({ type: "seam", blockId: prev.blockId, variant: "divider", gapMs });
  } else {
    rows.push({ type: "seam", blockId: prev.blockId, variant: "spacer" });
  }
}

function emitBlock(rows: DebuggerFlatRow[], vb: VisibleBlock, opts: BuildDebuggerFlatRowsOpts): void {
  switch (vb.kind) {
    case "text":
      rows.push({ type: "text", blockId: vb.blockId, text: vb.text });
      return;
    case "eval":
      rows.push({ type: "evaluation", blockId: vb.blockId, evaluation: vb.evaluation, createdAt: vb.createdAt });
      return;
    case "commands":
      emitCommands(rows, vb.blockId, vb.commands, opts);
      return;
    case "trace":
      emitTrace(rows, vb.blockId, vb.traceId, vb.traceIndex, opts);
      return;
  }
}

// A command run always renders as a collapsible group (header + optional
// bead/detail rows) — even a run of ONE. Rendering a singleton differently split
// its expand state across two sets, so a singleton later absorbed into a group
// lost its open bit and collapsed (LAM-2004 bot finding). One model, one bug-free
// path; a lone command is just a group of one.
function emitCommands(
  rows: DebuggerFlatRow[],
  groupId: string,
  commands: CommandGroupItem[],
  { expandedCommandGroupIds, expandedCommandBlockIds }: BuildDebuggerFlatRowsOpts
): void {
  // A lone command needs no group wrapper: render it directly as its command row
  // (+ detail when expanded). No header, no group-collapse — the row's own
  // chevron toggles the detail. isFirst && isLast means it draws no connector.
  if (commands.length === 1) {
    const only = commands[0];
    const cmdExpanded = expandedCommandBlockIds.has(only.id);
    rows.push({
      type: "command-item",
      blockId: groupId,
      commandId: only.id,
      command: only.command,
      expanded: cmdExpanded,
      isFirst: true,
      isLast: true,
    });
    if (cmdExpanded) {
      rows.push({
        type: "command-item-detail",
        blockId: groupId,
        commandId: only.id,
        command: only.command,
        isLastRow: true,
      });
    }
    return;
  }
  const groupExpanded = expandedCommandGroupIds.has(groupId);
  rows.push({
    type: "command-group-header",
    blockId: groupId,
    count: commands.length,
    lastCreatedAt: commands[commands.length - 1].createdAt,
    expanded: groupExpanded,
  });
  if (!groupExpanded) return;
  commands.forEach((c, idx) => {
    const isLast = idx === commands.length - 1;
    const cmdExpanded = expandedCommandBlockIds.has(c.id);
    rows.push({
      type: "command-item",
      blockId: groupId,
      commandId: c.id,
      command: c.command,
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

function emitTrace(
  rows: DebuggerFlatRow[],
  blockId: string,
  traceId: string,
  traceIndex: number,
  opts: BuildDebuggerFlatRowsOpts
): void {
  const {
    tracesById,
    traceSpans,
    traceSpansFetching,
    traceSpansError,
    expandedTraceIds,
    transcriptExpandedGroups,
    traceViewModes,
  } = opts;
  const trace = tracesById.get(traceId);
  if (!trace) {
    rows.push({ type: "trace-skeleton", blockId, traceId });
    return;
  }
  const expanded = expandedTraceIds.has(traceId);
  rows.push({ type: "trace-header", blockId, traceId, trace, traceIndex, expanded });
  if (!expanded) {
    rows.push({ type: "trace-collapsed-body", blockId, traceId, trace });
    return;
  }
  const error = traceSpansError[traceId];
  const spans = traceSpans[traceId];
  const fetching = !!traceSpansFetching[traceId];
  if (error) {
    rows.push({ type: "trace-error", blockId, traceId, error });
    return;
  }
  if (!spans || spans.length === 0) {
    rows.push(
      !spans || fetching ? { type: "trace-loading", blockId, traceId } : { type: "trace-empty", blockId, traceId }
    );
    return;
  }
  rows.push({ type: "user-input", blockId, traceId, trace });
  appendSpanRows(rows, blockId, traceId, spans, traceViewModes[traceId] ?? "transcript", transcriptExpandedGroups);
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
    case "seam":
      // One seam per block (the one after it), so the prev block's id is unique.
      return `seam::${row.blockId}`;
  }
};

// Per-row-type initial height estimate (near median rendered heights so measure
// re-anchors less).
export const flatRowEstimate = (row: DebuggerFlatRow, showTreeContent: boolean): number => {
  switch (row.type) {
    case "trace-header":
      return 44;
    case "trace-collapsed-body":
      return 200;
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
    case "seam":
      // Divider carries a hairline + label (SEAM padding each side); spacer is bare.
      return row.variant === "divider" ? SEAM * 2 + 18 : SEAM;
    case "text":
      return 180;
    // Collapsed one-liner; expanding re-measures via measureElement.
    case "command-group-header":
      return 48;
    // Bead row (one line); detail card re-measures via measureElement.
    case "command-item":
      return 34;
    // Estimate the COLLAPSED start height (not the expanded card): the detail row
    // is inserted closed and animates grid 0fr→1fr open, so a large estimate would
    // reserve full height for one frame on insert, then snap up — a visible flash.
    // Measurements are cached per row key, so remounts of an expanded detail use
    // the real size, not this estimate.
    case "command-item-detail":
      return 12;
    // Expanded (default) card: 40px header + ~137px progression chart + one row
    // of score stats (~68px). Collapsed cards re-measure to the bare header.
    case "evaluation":
      return 248;
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
