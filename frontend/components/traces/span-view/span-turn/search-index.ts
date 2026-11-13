import { countMatches } from "@/components/traces/span-view/searchable/find-matches";
import { renderText } from "@/components/ui/content-renderer/utils";
import { resolveContentMode } from "@/lib/spans/resolve-content-mode";
import { type TurnPart } from "@/lib/spans/turn-parts";

import { type ConversationRow, type MessageRow, type SectionKey } from "./build-rows";

/**
 * The span's searchable text, one entry per row: what each of the row's editors shows. Search runs over this instead
 * of the mounted editors, so it covers rows the virtualizer never rendered and parts that are collapsed.
 */
export interface TurnSearchIndex {
  keys: string[];
  /** Per row, one text per part (for normalized messages, `texts[i]` is part `i`). */
  texts: string[][];
}

/** Per-row match counts, keyed like the index, for one term. */
export interface TurnMatches {
  /** Rows with at least one match, mapped to their per-part counts. */
  byRow: Map<string, number[]>;
  /** Row keys in order, with each row's total; navigation walks this. */
  order: { key: string; count: number }[];
  total: number;
}

// The text ContentRenderer puts in the editor for a part's value (resolveContentMode picks the mode, renderText
// formats it and swaps base64 images for placeholders).
const displayed = (value: unknown): string => {
  const { mode, value: text } = resolveContentMode(value);
  return renderText(mode, text, true).text;
};

const partText = (part: TurnPart): string => {
  switch (part.kind) {
    case "text":
    case "reasoning":
      return displayed(part.text);
    case "tool-call":
      return displayed(part.args);
    case "tool-result":
      return displayed(part.output);
  }
};

// Provider-rendered messages (images, files, provider-specific items) are laid out per format, so their text is
// approximated by the message's string leaves, minus fields those renderers show as chrome or media.
const SKIPPED_KEYS = new Set(["role", "type", "image_url", "file_data", "inlineData", "fileData", "source"]);

const stringLeaves = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(displayed(value));
  else if (Array.isArray(value)) value.forEach((item) => stringLeaves(item, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) if (!SKIPPED_KEYS.has(key)) stringLeaves(item, out);
  }
  return out;
};

const messageTexts = (row: MessageRow): string[] =>
  row.normalized ? row.normalized.parts.map(partText) : stringLeaves(row.segment.messages[row.localIndex]);

/** Raw section formats render the whole payload in the section header; custom templates are not searchable. */
export interface SectionText {
  mode: string;
  value: string;
}

const rowTexts = (row: ConversationRow, sections: Record<SectionKey, SectionText>): string[] => {
  switch (row.kind) {
    case "message":
      return messageTexts(row);
    case "section": {
      const { mode, value } = sections[row.section];
      return mode === "messages" || mode === "custom" ? [] : [renderText(mode, value, true).text];
    }
    case "context":
      return [];
  }
};

/** `rows` must be the list with the context open, so folded messages are searchable too. */
export const buildTurnSearchIndex = (
  rows: ConversationRow[],
  sections: Record<SectionKey, SectionText>
): TurnSearchIndex => ({
  keys: rows.map((row) => row.key),
  texts: rows.map((row) => rowTexts(row, sections)),
});

export const matchTurn = (index: TurnSearchIndex, pattern: RegExp | null): TurnMatches => {
  const byRow = new Map<string, number[]>();
  const order: TurnMatches["order"] = [];
  let total = 0;
  if (!pattern) return { byRow, order, total };
  index.texts.forEach((texts, i) => {
    const counts = texts.map((text) => countMatches(text, pattern));
    const count = counts.reduce((sum, n) => sum + n, 0);
    if (count === 0) return;
    byRow.set(index.keys[i], counts);
    order.push({ key: index.keys[i], count });
    total += count;
  });
  return { byRow, order, total };
};

/** The row holding global match `global` and the match's position within that row. */
export const locateMatch = (matches: TurnMatches, global: number): { key: string; local: number } | undefined => {
  let remaining = global;
  for (const { key, count } of matches.order) {
    if (remaining < count) return { key, local: remaining };
    remaining -= count;
  }
  return undefined;
};
