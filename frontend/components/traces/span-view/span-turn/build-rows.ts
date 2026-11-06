import { type ProcessedMessages } from "@/lib/spans/process-messages";
import { canonicalRole, segmentMessageRole, type SpanTurn } from "@/lib/spans/turn";
import { linkToolResults, type NormalizedMessage, normalizeMessage, type TurnPart } from "@/lib/spans/turn-parts";
import { pluralize } from "@/lib/utils";

const PREVIEW_HEIGHT = 120;
const HISTORY_HEIGHT = 320;
const INPUT_HEIGHT = 560;

export type SectionKey = "input" | "output";

/** A message's position in its section of the span payload; message links address it. */
export interface MessageAnchor {
  section: SectionKey;
  index: number;
}

type Source = "system" | "task" | "history" | "previous" | "input" | "output";

export type MessageRow = {
  kind: "message";
  key: string;
  /** Merged cards keep their first message's anchor. */
  anchor: MessageAnchor;
  segment: ProcessedMessages;
  localIndex: number;
  /** Null falls back to the provider renderer. */
  normalized: NormalizedMessage | null;
  source: Source;
  /** Inside the opened context fold, hanging off its rail. */
  inContext?: boolean;
  /** Followed by another tool message: drawn close to it, as one group. */
  grouped?: boolean;
  maxHeight?: number;
  defaultExpanded?: boolean;
};

export type ConversationRow =
  | { kind: "section"; key: string; section: SectionKey; summary?: string }
  /** Inside Input: system prompt + earlier steps, folded into one card. */
  | { kind: "context"; key: string; summary: string; open: boolean }
  | MessageRow;

const CONTEXT_SOURCES = new Set<Source>(["system", "task", "history", "previous"]);

/** Rows shown inside the opened context, which hang off one rail. */
export const isContextRow = (row: MessageRow) => !!row.inContext;

/** Only earlier steps make a fold worth it; on a first call the system prompt shows inline. */
export const hasContextFold = (turn: SpanTurn) => turn.earlierSteps > 0;

const INPUT_PARTS = ["system", "task", "history", "previous", "input"] as const;

export const anchorOf = (turn: SpanTurn, source: Source, localIndex: number): MessageAnchor => {
  if (source === "output") return { section: "output", index: localIndex };
  const offset = INPUT_PARTS.slice(0, INPUT_PARTS.indexOf(source)).reduce(
    (sum, part) => sum + (turn[part]?.messages.length ?? 0),
    0
  );
  return { section: "input", index: offset + localIndex };
};

interface Segment {
  source: Source;
  processed?: ProcessedMessages;
  /** Normalized (so this call's results can name their calls) but not rendered. */
  hidden?: boolean;
  maxHeight?: number;
  defaultExpanded?: boolean;
}

/**
 * Input (system prompt + earlier steps folded into one context card, then this call's new messages) / Output.
 * A section shown in a raw format gets just its header, which holds the whole payload.
 */
export const buildRows = (
  turn: SpanTurn,
  contextOpen: boolean,
  raw: Record<SectionKey, boolean>
): ConversationRow[] => {
  const folds = !raw.input && hasContextFold(turn);
  const open = contextOpen || !folds;
  const segments: Segment[] = [
    ...(raw.input
      ? []
      : ([
          { source: "system", processed: turn.system, hidden: !open, maxHeight: PREVIEW_HEIGHT },
          { source: "task", processed: turn.task, hidden: !open, maxHeight: PREVIEW_HEIGHT },
          { source: "history", processed: open ? turn.history : undefined, maxHeight: HISTORY_HEIGHT },
          { source: "previous", processed: turn.previous, hidden: !open, maxHeight: HISTORY_HEIGHT },
          { source: "input", processed: turn.input, maxHeight: INPUT_HEIGHT },
        ] satisfies Segment[])),
    ...(raw.output ? [] : [{ source: "output", processed: turn.output, defaultExpanded: true } satisfies Segment]),
  ];
  const messages = segments.flatMap((segment) =>
    segment.processed ? segment.processed.messages.map((_, localIndex) => ({ segment, localIndex })) : []
  );

  const normalized = linkToolResults(
    messages.map(({ segment, localIndex }) => normalizeMessage(segment.processed!, localIndex))
  );

  const bySource = new Map<Source, MessageRow[]>();
  messages.forEach(({ segment, localIndex }, i) => {
    const message = normalized[i];
    if (segment.hidden || message?.parts.length === 0) return;
    const row: MessageRow = {
      kind: "message",
      key: `${segment.source}-${localIndex}`,
      anchor: anchorOf(turn, segment.source, localIndex),
      segment: segment.processed!,
      localIndex,
      normalized: message,
      source: segment.source,
      inContext: folds && CONTEXT_SOURCES.has(segment.source),
      maxHeight: segment.maxHeight,
      defaultExpanded: segment.defaultExpanded,
    };
    bySource.set(segment.source, [...(bySource.get(segment.source) ?? []), row]);
  });
  // Per source, so a merged card never spans earlier steps, new input and output.
  const rowsOf = (source: Source) => groupToolResults(mergeResponsesTurns(bySource.get(source) ?? []));

  const rows: ConversationRow[] = [];
  if (turn.system || turn.task || turn.history || turn.previous || turn.input) {
    const newRows = rowsOf("input");
    const earlierRows = [...rowsOf("system"), ...rowsOf("task"), ...rowsOf("history"), ...rowsOf("previous")];
    // Only when the whole input is new does a summary of it describe the Input section.
    const whollyNew = earlierRows.length === 0 && !folds && newRows.length > 0;
    rows.push({
      kind: "section",
      key: "section-input",
      section: "input",
      summary: whollyNew ? summarizeNewInput(newRows) : undefined,
    });
    if (folds) rows.push({ kind: "context", key: "context", summary: contextSummary(turn), open: contextOpen });
    rows.push(...earlierRows, ...newRows);
  }
  if (turn.output) {
    rows.push({ kind: "section", key: "section-output", section: "output" }, ...rowsOf("output"));
  }
  return rows;
};

// Adjacent in the original payload. Rows can become neighbours only because the messages between them were
// skipped (e.g. empty ones), and those messages are what separate two LLM calls.
const adjacent = (a: MessageRow, b: MessageRow) => a.segment === b.segment && b.localIndex === a.localIndex + 1;

/** Replaces each run of payload-adjacent rows matching `belongs` with one card holding all their parts. */
const mergeRuns = (
  rows: MessageRow[],
  belongs: (row: MessageRow) => boolean,
  merge: (first: MessageRow, parts: TurnPart[]) => MessageRow
): MessageRow[] => {
  const runs: MessageRow[][] = [];
  rows.forEach((row, i) => {
    const run = runs.at(-1);
    if (run && belongs(row) && belongs(rows[i - 1]) && adjacent(rows[i - 1], row)) run.push(row);
    else runs.push([row]);
  });
  return runs.map((run) =>
    run.length > 1
      ? merge(
          run[0],
          run.flatMap((row) => row.normalized!.parts)
        )
      : run[0]
  );
};

const isResultsOnly = (row: MessageRow) =>
  !!row.normalized?.parts.length && row.normalized.parts.every((part) => part.kind === "tool-result");

/** Each tool message keeps its own card; consecutive ones form a group. */
const groupToolResults = (rows: MessageRow[]) =>
  rows.map((row, i) => (isResultsOnly(row) ? { ...row, grouped: !!rows[i + 1] && isResultsOnly(rows[i + 1]) } : row));

// The Responses API splits one assistant turn into top-level items (reasoning, message, one per tool call), and it
// has no `n`, so a run is never alternative choices. Other formats keep a turn in one message, and their consecutive
// assistant messages can be separate choices (Chat `choices`, Gemini `candidates`, GenAI outputs) or agents.
const isResponsesAssistantItem = (row: MessageRow) =>
  row.segment.type === "openai-responses" &&
  !!row.normalized?.parts.length &&
  canonicalRole(row.normalized.role) === "assistant";

const mergeResponsesTurns = (rows: MessageRow[]) =>
  mergeRuns(rows, isResponsesAssistantItem, (first, parts) => ({ ...first, normalized: { role: "assistant", parts } }));

const rowRole = (row: MessageRow) =>
  canonicalRole(row.normalized?.role ?? segmentMessageRole(row.segment, row.localIndex));

// Provider-rendered rows (no normalized parts) count as one result when their role is `tool`.
const toolResultCount = (row: MessageRow) =>
  row.normalized
    ? row.normalized.parts.filter((part) => part.kind === "tool-result").length
    : rowRole(row) === "tool"
      ? 1
      : 0;

/** "system prompt + 23 earlier steps": what is folded away before this call's new input. */
const contextSummary = (turn: SpanTurn): string =>
  [
    turn.system && "system prompt",
    turn.earlierSteps > 0 && pluralize(turn.earlierSteps, "earlier step", "earlier steps"),
  ]
    .filter(Boolean)
    .join(" + ");

/** "4 tool results", "1 user message", "3 messages": what the Input section holds. */
const summarizeNewInput = (rows: MessageRow[]): string => {
  const results = rows.reduce((sum, row) => sum + toolResultCount(row), 0);
  if (rows.every((row) => toolResultCount(row) > 0 && (!row.normalized || isResultsOnly(row)))) {
    return pluralize(results, "tool result", "tool results");
  }
  if (rows.every((row) => rowRole(row) === "user" && toolResultCount(row) === 0)) {
    return pluralize(rows.length, "user message", "user messages");
  }
  return pluralize(rows.length, "message", "messages");
};
