import { type CommandBlockContent } from "@/lib/actions/debugger-sessions/command-content";

import { type SessionBlockView, type TraceRowState } from "../store";

// Anchor ids linking each outline row to its block in the timeline. Trace-scoped
// so identical ids don't collide across runs.
export const traceAnchorId = (traceId: string): string => `outline-trace-${traceId}`;
export const evalAnchorId = (evaluationId: string): string => `outline-eval-${evaluationId}`;
export const textAnchorId = (blockId: string): string => `outline-text-${blockId}`;
export const commandAnchorId = (blockId: string): string => `outline-command-${blockId}`;

// A row per block (trace / eval / text / command), in timeline order (blocks are
// ordered by created_at). Keyed by block id — the same key the virtualized list
// tracks as `activeBlockId` and accepts in scroll requests. A collapsed command
// group keys off its first member; `memberIds` holds every block it stands in for
// so the active indicator can match any of them (singletons carry just their own).
export type OutlineRow = {
  blockId: string;
  text: string;
  kind: "trace" | "eval" | "text" | "command";
  memberIds: string[];
};

const TEXT_BLOCK_TITLE_LEN = 40;

// Text blocks are markdown, so a raw slice surfaces syntax like "## text…". Strip
// it down to plain text: drop leading block markers (headings, bullets,
// blockquotes), unwrap inline emphasis/code, and reduce links to their label.
const MARKDOWN_RULES: [RegExp, string][] = [
  [/```[\s\S]*?```/g, " "], // fenced code blocks
  [/^\s*(?:#{1,6}|>+|[-*+]|\d+\.)\s+/gm, ""], // leading block markers
  [/!?\[([^\]]*)\]\([^)]*\)/g, "$1"], // links / images -> label
  [/(\*\*|__|\*|_|~~|`)(.*?)\1/g, "$2"], // bold / italic / strikethrough / inline code
];

const ellipsize = (s: string, fallback: string): string =>
  s.length > TEXT_BLOCK_TITLE_LEN ? `${s.slice(0, TEXT_BLOCK_TITLE_LEN)}…` : s || fallback;

// A short plain-text label for a standalone text block: markdown stripped,
// whitespace collapsed, truncated with an ellipsis.
const textBlockTitle = (text: string): string =>
  ellipsize(
    MARKDOWN_RULES.reduce((s, [re, to]) => s.replace(re, to), text)
      .replace(/\s+/g, " ")
      .trim(),
    "Note"
  );

// Outline label for a command run (always a group, even of one) — singular copy
// for a lone command so it doesn't read "CLI commands (1)".
const commandGroupTitle = (count: number): string => (count === 1 ? "CLI command" : `CLI commands (${count})`);

// Build the outline rows from the timeline blocks. Every contiguous command run
// collapses into one group row (even a run of one); missing traces are
// transparent (see inline note).
export const buildRows = (blocks: SessionBlockView[], traceRowStates: Record<string, TraceRowState>): OutlineRow[] => {
  const rows: OutlineRow[] = [];
  let traceIndex = 0;
  let pending: { id: string; command: CommandBlockContent }[] = [];
  const flushCommands = () => {
    if (pending.length === 0) return;
    // Every command run — even one command — is a group row, mirroring the
    // timeline (flat-rows always groups). Keep this in lockstep with emitCommands.
    rows.push({
      blockId: pending[0].id,
      text: commandGroupTitle(pending.length),
      kind: "command",
      memberIds: pending.map((c) => c.id),
    });
    pending = [];
  };

  for (const block of blocks) {
    if (block.type === "command") {
      pending.push({ id: block.id, command: block.command });
      continue;
    }
    // A missing trace is transparent: it renders no timeline/outline row, so it
    // neither breaks a command run nor emits an entry — but numbering still
    // advances so it stays in lockstep with the timeline (which indexes every
    // trace block). A listed missing-trace entry would consume a scroll click
    // without scrolling and strand the active highlight over an empty gap.
    if (block.type === "trace" && traceRowStates[block.traceId] === "missing") {
      traceIndex += 1;
      continue;
    }
    // Any other rendered block ends the current command run before its own row.
    flushCommands();
    if (block.type === "evaluation") {
      rows.push({ blockId: block.id, text: block.evaluation.name, kind: "eval", memberIds: [block.id] });
    } else if (block.type === "text") {
      rows.push({ blockId: block.id, text: textBlockTitle(block.text), kind: "text", memberIds: [block.id] });
    } else if (block.type === "trace") {
      traceIndex += 1;
      rows.push({ blockId: block.id, text: `Trace ${traceIndex}`, kind: "trace", memberIds: [block.id] });
    }
  }
  flushCommands();
  return rows;
};
