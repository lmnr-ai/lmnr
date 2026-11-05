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

export type TurnLayout = "compact" | "paired" | "all" | "focused";

export type ResultStyle = "rows" | "batched" | "previews";

export const RESULT_STYLES: { value: ResultStyle; label: string }[] = [
  { value: "rows", label: "Rows" },
  { value: "batched", label: "Batched" },
  { value: "previews", label: "Previews" },
];

export type NewInputStyle = "divider" | "rail" | "group";

export const NEW_INPUT_STYLES: { value: NewInputStyle; label: string }[] = [
  { value: "divider", label: "Divider" },
  { value: "rail", label: "Rail" },
  { value: "group", label: "Group" },
];

export const TURN_LAYOUTS: { value: TurnLayout; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "paired", label: "Paired" },
  { value: "all", label: "All" },
  { value: "focused", label: "Focused" },
];

const PREVIEW_HEIGHT = 120;
const HISTORY_HEIGHT = 320;
const INPUT_HEIGHT = 560;

const historyText = (amount: string, open: boolean) => `${open ? "Hide" : "Show"} ${amount}`;

export type SectionKey = "input" | "output";

export interface NewInputLabel {
  title: string;
  detail?: string;
}

export type MessageRow = {
  kind: "message";
  key: string;
  segment: ProcessedMessages;
  localIndex: number;
  /** Set when the layout renders normalized parts; null falls back to the provider renderer. */
  normalized: NormalizedMessage | null;
  source: "system" | "task" | "history" | "previous" | "input" | "output";
  /** Set when this turn's consecutive tool results are batched into this one card. */
  resultCount?: number;
  /** Focused layout: tool results as light indented previews (the Input header already counts them). */
  plainResults?: boolean;
  /** Set on this call's new input rows when Rail / Group frames them. */
  newInput?: { first: boolean; last: boolean; label: NewInputLabel };
  maxHeight?: number;
  defaultExpanded?: boolean;
};

export type ConversationRow =
  | { kind: "toggle"; key: string; text: string; open: boolean }
  | { kind: "section"; key: string; section: SectionKey; summary?: string; info?: boolean }
  /** Focused layout: system prompt + earlier steps folded behind one header. */
  | { kind: "context"; key: string; summary: string; open: boolean }
  /** Marks where this call's new input starts inside the Input section. */
  | { kind: "new-input"; key: string; label: NewInputLabel }
  | MessageRow;

interface SegmentSpec {
  key: MessageRow["source"];
  processed?: ProcessedMessages;
  /** Normalized (so this turn's results can name their calls) but not rendered. */
  hidden?: boolean;
  maxHeight?: number;
  defaultExpanded?: boolean;
}

interface ConversationOptions {
  batchResults: boolean;
  newInputStyle: NewInputStyle;
  /** Sections shown as a raw payload instead of messages; their message rows are skipped entirely. */
  raw: Record<SectionKey, boolean>;
}

/**
 * Compact / Paired / All: an Input section (system prompt, earlier messages behind a toggle, then this
 * call's new messages) and an Output section. The assistant step this call answers folds into the earlier messages.
 */
export const buildConversationRows = (
  turn: SpanTurn,
  historyOpen: boolean,
  layout: TurnLayout,
  { batchResults, newInputStyle, raw }: ConversationOptions
): ConversationRow[] => {
  const pair = layout === "paired" || layout === "all";

  const specs: SegmentSpec[] = [
    ...(raw.input
      ? []
      : ([
          { key: "system", processed: turn.system, hidden: !historyOpen, maxHeight: PREVIEW_HEIGHT },
          { key: "task", processed: turn.task, hidden: !historyOpen, maxHeight: PREVIEW_HEIGHT },
          { key: "history", processed: historyOpen ? turn.history : undefined, maxHeight: HISTORY_HEIGHT },
          { key: "previous", processed: turn.previous, hidden: !historyOpen, maxHeight: HISTORY_HEIGHT },
          { key: "input", processed: turn.input, maxHeight: INPUT_HEIGHT },
        ] satisfies SegmentSpec[])),
    ...(raw.output ? [] : [{ key: "output", processed: turn.output, defaultExpanded: true } satisfies SegmentSpec]),
  ];
  const messages = specs.flatMap((spec) =>
    spec.processed ? spec.processed.messages.map((_, localIndex) => ({ spec, localIndex })) : []
  );

  let normalized = messages.map(({ spec, localIndex }) => normalizeMessage(spec.processed!, localIndex));
  normalized = linkToolResults(normalized);
  // Pair only within earlier turns: this turn's results are new input and keep their own card.
  if (pair) {
    const pastCount = messages.filter(({ spec }) => spec.key !== "input" && spec.key !== "output").length;
    normalized = [...pairToolResults(normalized.slice(0, pastCount)), ...normalized.slice(pastCount)];
  }

  const bySource = new Map<MessageRow["source"], MessageRow[]>();
  messages.forEach(({ spec, localIndex }, i) => {
    const message = normalized[i];
    if (spec.hidden || (message && message.parts.length === 0)) return;
    const row: MessageRow = {
      kind: "message",
      key: `${spec.key}-${localIndex}`,
      segment: spec.processed!,
      localIndex,
      normalized: message,
      source: spec.key,
      maxHeight: spec.maxHeight,
      defaultExpanded: spec.defaultExpanded,
    };
    bySource.set(spec.key, [...(bySource.get(spec.key) ?? []), row]);
  });
  const rowsOf = (source: MessageRow["source"]) => bySource.get(source) ?? [];
  // Per section, so a merged card never spans history, new input and output.
  for (const rows of bySource.values()) mergeResponsesTurns(rows);

  const rows: ConversationRow[] = [];
  if (turn.system || turn.task || turn.history || turn.previous || turn.input) {
    rows.push({ kind: "section", key: "section-input", section: "input", info: true });
    if (!raw.input) {
      const hasEarlier = !!(turn.history || turn.previous);
      const newRows = rowsOf("input");
      if (batchResults) batchToolResults(newRows);
      // Only worth marking when something precedes it; otherwise the whole Input section is new.
      const markNew = newRows.length > 0 && !!(hasEarlier || turn.system || turn.task);
      const label = describeNewInput(newRows);
      const marker: ConversationRow[] =
        markNew && newInputStyle === "divider" ? [{ kind: "new-input", key: "new-input", label }] : [];
      if (markNew && newInputStyle !== "divider") {
        newRows.forEach((row, i, all) => {
          all[i] = { ...row, newInput: { first: i === 0, last: i === all.length - 1, label } };
        });
      }
      const context = contextSummary(turn);
      rows.push(
        // Everything sent before this call's new input folds behind one toggle, system prompt included.
        ...(context
          ? [{ kind: "toggle" as const, key: "toggle", text: historyText(context, historyOpen), open: historyOpen }]
          : []),
        ...rowsOf("system"),
        ...rowsOf("task"),
        ...rowsOf("history"),
        ...rowsOf("previous"),
        ...marker,
        ...newRows
      );
    }
  }
  if (turn.output) {
    rows.push({ kind: "section", key: "section-output", section: "output" }, ...rowsOf("output"));
  }
  return rows;
};

// Adjacent in the original payload. Rows can become neighbours only because the messages between them were
// skipped (e.g. tool outputs paired under their calls), and those messages are what separate two LLM calls.
const adjacent = (a: MessageRow, b: MessageRow) => a.segment === b.segment && b.localIndex === a.localIndex + 1;

const rowRole = (row: MessageRow) =>
  canonicalRole(row.normalized?.role ?? segmentMessageRole(row.segment, row.localIndex));

const toolResultCount = (row: MessageRow) =>
  row.normalized
    ? row.normalized.parts.filter((part) => part.kind === "tool-result").length
    : rowRole(row) === "tool"
      ? 1
      : 0;

const totalResults = (rows: MessageRow[]) => rows.reduce((sum, row) => sum + toolResultCount(row), 0);

const onlyToolResults = (rows: MessageRow[]) =>
  rows.every(
    (row) =>
      toolResultCount(row) > 0 && (!row.normalized || row.normalized.parts.every((p) => p.kind === "tool-result"))
  );

const onlyUserMessages = (rows: MessageRow[]) =>
  rows.every((row) => rowRole(row) === "user" && toolResultCount(row) === 0);

/** Says what this call's new input is in plain words, so the label explains itself without knowing the agent loop. */
const describeNewInput = (rows: MessageRow[]): NewInputLabel => {
  if (onlyToolResults(rows))
    return { title: "Tool results from the previous step", detail: String(totalResults(rows)) };
  const messageCount = rows.length;
  if (onlyUserMessages(rows)) {
    return messageCount === 1
      ? { title: "New user message" }
      : { title: "New user messages", detail: String(messageCount) };
  }
  return { title: "New since the previous step", detail: pluralize(messageCount, "message", "messages") };
};

/** Replaces each run of payload-adjacent rows matching `belongs` with one card holding all their parts, in place. */
const mergeRuns = (
  rows: MessageRow[],
  belongs: (row: MessageRow) => boolean,
  merge: (first: MessageRow, parts: TurnPart[]) => MessageRow
) => {
  for (let i = 0; i < rows.length; i++) {
    if (!belongs(rows[i])) continue;
    let end = i + 1;
    while (end < rows.length && belongs(rows[end]) && adjacent(rows[end - 1], rows[end])) end++;
    const parts = rows.slice(i, end).flatMap((row) => row.normalized!.parts);
    rows.splice(i, end - i, merge(rows[i], parts));
  }
};

const isResultsOnly = (row: MessageRow) =>
  !!row.normalized?.parts.length && row.normalized.parts.every((part) => part.kind === "tool-result");

/** Merges consecutive tool-result messages into one card, in place. */
const batchToolResults = (rows: MessageRow[]) =>
  mergeRuns(rows, isResultsOnly, (first, parts) => ({
    ...first,
    normalized: { role: "tool", parts },
    resultCount: parts.length,
  }));

// The Responses API splits one assistant turn into top-level items (reasoning, message, one per tool call), and it
// has no `n`, so a run is never alternative choices. Other formats keep a turn in one message, and their consecutive
// assistant messages can be separate choices (Chat `choices`, Gemini `candidates`, GenAI outputs) or agents.
const isResponsesAssistantItem = (row: MessageRow) =>
  row.segment.type === "openai-responses" &&
  !!row.normalized?.parts.length &&
  canonicalRole(row.normalized.role) === "assistant";

/** Merges a Responses turn's consecutive assistant items into one card, in place. */
const mergeResponsesTurns = (rows: MessageRow[]) =>
  mergeRuns(rows, isResponsesAssistantItem, (first, parts) => ({
    ...first,
    normalized: { role: "assistant", parts },
  }));

/** "system prompt + 23 earlier steps": what is folded away before this call's new input. */
const contextSummary = (turn: SpanTurn): string =>
  [
    turn.system && "system prompt",
    turn.earlierSteps > 0 && pluralize(turn.earlierSteps, "earlier step", "earlier steps"),
  ]
    .filter(Boolean)
    .join(" + ");

/** "4 tool results", "1 user message", "3 messages": what the Focused Input section holds. */
const summarizeNewInput = (rows: MessageRow[]): string => {
  if (onlyToolResults(rows)) return pluralize(totalResults(rows), "tool result", "tool results");
  if (onlyUserMessages(rows)) return pluralize(rows.length, "user message", "user messages");
  return pluralize(rows.length, "message", "messages");
};

/**
 * Focused: Context (system prompt + earlier steps, one collapsed header) / Input (only what is new in this call) /
 * Output. Built from the All rows, so processing, pairing, merging and batching are shared.
 */
export const buildFocusedRows = (
  turn: SpanTurn,
  contextOpen: boolean,
  raw: Record<SectionKey, boolean>
): ConversationRow[] => {
  const messages = buildConversationRows(turn, contextOpen, "all", {
    batchResults: true,
    newInputStyle: "divider",
    raw,
  }).filter((row): row is MessageRow => row.kind === "message");
  const newRows = messages
    .filter((row) => row.source === "input")
    .map((row) => (isResultsOnly(row) ? { ...row, plainResults: true, resultCount: undefined } : row));

  const rows: ConversationRow[] = [];
  if (turn.system || turn.task || turn.history || turn.previous || turn.input) {
    const context = contextSummary(turn);
    // In a raw format the Input section shows the full payload, context included.
    if (context && !raw.input) {
      rows.push({ kind: "context", key: "context", summary: context, open: contextOpen });
      if (contextOpen) rows.push(...messages.filter((row) => row.source !== "input" && row.source !== "output"));
    }
    rows.push({
      kind: "section",
      key: "section-input",
      section: "input",
      summary: newRows.length > 0 ? summarizeNewInput(newRows) : undefined,
    });
    rows.push(...newRows);
  }
  if (turn.output) {
    rows.push(
      { kind: "section", key: "section-output", section: "output" },
      ...messages.filter((row) => row.source === "output")
    );
  }
  return rows;
};
