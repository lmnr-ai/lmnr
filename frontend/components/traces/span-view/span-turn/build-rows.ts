import { type ProcessedMessages } from "@/lib/spans/process-messages";
import { canonicalRole, segmentMessageRole, type SpanTurn } from "@/lib/spans/turn";
import {
  linkToolResults,
  type NormalizedMessage,
  normalizeMessage,
  pairToolResults,
  type TurnPart,
} from "@/lib/spans/turn-parts";
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
  /** This call's tool results, shown as light previews (the Input header already counts them). */
  plainResults?: boolean;
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
export const isContextRow = (row: MessageRow) => CONTEXT_SOURCES.has(row.source);

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
  const segments: Segment[] = [
    ...(raw.input
      ? []
      : ([
          { source: "system", processed: turn.system, hidden: !contextOpen, maxHeight: PREVIEW_HEIGHT },
          { source: "task", processed: turn.task, hidden: !contextOpen, maxHeight: PREVIEW_HEIGHT },
          { source: "history", processed: contextOpen ? turn.history : undefined, maxHeight: HISTORY_HEIGHT },
          { source: "previous", processed: turn.previous, hidden: !contextOpen, maxHeight: HISTORY_HEIGHT },
          { source: "input", processed: turn.input, maxHeight: INPUT_HEIGHT },
        ] satisfies Segment[])),
    ...(raw.output ? [] : [{ source: "output", processed: turn.output, defaultExpanded: true } satisfies Segment]),
  ];
  const messages = segments.flatMap((segment) =>
    segment.processed ? segment.processed.messages.map((_, localIndex) => ({ segment, localIndex })) : []
  );

  const linked = linkToolResults(
    messages.map(({ segment, localIndex }) => normalizeMessage(segment.processed!, localIndex))
  );
  // Pair only within earlier steps: this call's results are new input and keep their own card.
  const pastCount = messages.filter(({ segment }) => segment.source !== "input" && segment.source !== "output").length;
  const normalized = [...pairToolResults(linked.slice(0, pastCount)), ...linked.slice(pastCount)];

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
      maxHeight: segment.maxHeight,
      defaultExpanded: segment.defaultExpanded,
    };
    bySource.set(segment.source, [...(bySource.get(segment.source) ?? []), row]);
  });
  // Per source, so a merged card never spans earlier steps, new input and output.
  const rowsOf = (source: Source) => mergeResponsesTurns(bySource.get(source) ?? []);

  const rows: ConversationRow[] = [];
  if (turn.system || turn.task || turn.history || turn.previous || turn.input) {
    const context = raw.input ? "" : contextSummary(turn);
    const newRows = batchToolResults(rowsOf("input"));
    const summary = newRows.length > 0 ? summarizeNewInput(newRows) : undefined;
    // Only when the whole input is new does a summary of it describe the Input section.
    rows.push({ kind: "section", key: "section-input", section: "input", summary: context ? undefined : summary });
    if (context) {
      rows.push({ kind: "context", key: "context", summary: context, open: contextOpen });
      if (contextOpen) rows.push(...rowsOf("system"), ...rowsOf("task"), ...rowsOf("history"), ...rowsOf("previous"));
    }
    rows.push(...newRows);
  }
  if (turn.output) {
    rows.push({ kind: "section", key: "section-output", section: "output" }, ...rowsOf("output"));
  }
  return rows;
};

// Adjacent in the original payload. Rows can become neighbours only because the messages between them were
// skipped (e.g. tool outputs paired under their calls), and those messages are what separate two LLM calls.
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

/** This call's tool results: consecutive ones share a card, and all show as light previews. */
const batchToolResults = (rows: MessageRow[]) =>
  mergeRuns(rows, isResultsOnly, (first, parts) => ({ ...first, normalized: { role: "tool", parts } })).map((row) =>
    isResultsOnly(row) ? { ...row, plainResults: true } : row
  );

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
