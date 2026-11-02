import { diffLines, diffWordsWithSpace } from "diff";

export interface Segment {
  text: string;
  // Changed word within a line — rendered with a stronger highlight.
  highlight: boolean;
}

export interface GapRow {
  type: "gap";
  count: number;
}

export type DiffRow =
  | { type: "equal"; text: string }
  | { type: "add"; segments: Segment[] }
  | { type: "remove"; segments: Segment[] }
  | GapRow;

export interface SplitSide {
  /** 1-based line number within its own text. */
  num: number;
  segments: Segment[];
}

/** One aligned line pair; a `change` side is absent where the other text has no counterpart. */
export type SplitRow =
  | { type: "equal"; left: SplitSide; right: SplitSide }
  | { type: "change"; left?: SplitSide; right?: SplitSide }
  | GapRow;

// jsdiff line parts keep a trailing newline; drop the spurious empty tail.
function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Word-diff a removed/added line pair into highlighted segments for each side.
function pairSegments(removedLine: string, addedLine: string): { removed: Segment[]; added: Segment[] } {
  const parts = diffWordsWithSpace(removedLine, addedLine);
  const removed: Segment[] = [];
  const added: Segment[] = [];
  for (const part of parts) {
    if (part.added) {
      added.push({ text: part.value, highlight: true });
    } else if (part.removed) {
      removed.push({ text: part.value, highlight: true });
    } else {
      removed.push({ text: part.value, highlight: false });
      added.push({ text: part.value, highlight: false });
    }
  }
  return { removed, added };
}

const plain = (line: string): Segment[] => [{ text: line, highlight: false }];

// Line diff with intra-line word highlighting: a removed block followed by an added block
// is paired line-by-line and word-diffed; unpaired extras render as whole add/remove lines.
export function computeDiffRows(oldText: string, newText: string): DiffRow[] {
  const parts = diffLines(oldText ?? "", newText ?? "", { ignoreNewlineAtEof: true });
  const rows: DiffRow[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!part.added && !part.removed) {
      for (const line of splitLines(part.value)) rows.push({ type: "equal", text: line });
      continue;
    }

    if (part.removed) {
      const removedLines = splitLines(part.value);
      const next = parts[i + 1];

      if (next?.added) {
        const addedLines = splitLines(next.value);
        const paired = Math.min(removedLines.length, addedLines.length);
        for (let k = 0; k < paired; k++) {
          const { removed, added } = pairSegments(removedLines[k], addedLines[k]);
          rows.push({ type: "remove", segments: removed });
          rows.push({ type: "add", segments: added });
        }
        for (let k = paired; k < removedLines.length; k++)
          rows.push({ type: "remove", segments: plain(removedLines[k]) });
        for (let k = paired; k < addedLines.length; k++) rows.push({ type: "add", segments: plain(addedLines[k]) });
        i++; // consumed the paired added part
      } else {
        for (const line of removedLines) rows.push({ type: "remove", segments: plain(line) });
      }
      continue;
    }

    // Pure addition (no preceding removal).
    for (const line of splitLines(part.value)) rows.push({ type: "add", segments: plain(line) });
  }

  return rows;
}

// Same pairing as `computeDiffRows`, but each removed/added pair shares one row.
export function computeSplitRows(oldText: string, newText: string): SplitRow[] {
  const parts = diffLines(oldText ?? "", newText ?? "", { ignoreNewlineAtEof: true });
  const rows: SplitRow[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!part.added && !part.removed) {
      for (const line of splitLines(part.value)) {
        rows.push({
          type: "equal",
          left: { num: ++oldNum, segments: plain(line) },
          right: { num: ++newNum, segments: plain(line) },
        });
      }
      continue;
    }

    const removedLines = part.removed ? splitLines(part.value) : [];
    const addedSource = part.removed ? parts[i + 1] : part;
    const addedLines = addedSource?.added ? splitLines(addedSource.value) : [];
    if (part.removed && addedSource?.added) i++;

    for (let k = 0; k < Math.max(removedLines.length, addedLines.length); k++) {
      const removedLine = removedLines[k];
      const addedLine = addedLines[k];
      if (removedLine !== undefined && addedLine !== undefined) {
        const { removed, added } = pairSegments(removedLine, addedLine);
        rows.push({
          type: "change",
          left: { num: ++oldNum, segments: removed },
          right: { num: ++newNum, segments: added },
        });
      } else if (removedLine !== undefined) {
        rows.push({ type: "change", left: { num: ++oldNum, segments: plain(removedLine) } });
      } else {
        rows.push({ type: "change", right: { num: ++newNum, segments: plain(addedLine) } });
      }
    }
  }

  return rows;
}

// Collapse long runs of unchanged lines into a placeholder, keeping `context` lines around changes.
export function collapseDiffRows<T extends { type: string }>(rows: T[], context = 3): (T | GapRow)[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, idx) => {
    if (row.type !== "equal") {
      for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) keep[k] = true;
    }
  });

  const out: (T | GapRow)[] = [];
  let gap = 0;
  rows.forEach((row, idx) => {
    if (keep[idx]) {
      if (gap > 0) {
        out.push({ type: "gap", count: gap });
        gap = 0;
      }
      out.push(row);
    } else {
      gap++;
    }
  });
  if (gap > 0) out.push({ type: "gap", count: gap });

  return out;
}
