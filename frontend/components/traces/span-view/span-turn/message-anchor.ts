import { type SpanTurn } from "@/lib/spans/turn";

import { anchorOf, type ConversationRow, hasContextFold, type MessageAnchor } from "./build-rows";

const HASH = /^#(input|output)-(\d+)$/;

/** `#input-12` / `#output-0`: the hash a message link carries. */
export const parseAnchorHash = (hash: string): MessageAnchor | undefined => {
  const match = HASH.exec(hash);
  return match ? { section: match[1] as MessageAnchor["section"], index: Number(match[2]) } : undefined;
};

// The hash names no span, and not every span change rewrites the URL (nuqs keeps the hash, some selections skip the
// URL), so it only counts while `?spanId` is that span.
export const linkedAnchor = (search: string, hash: string, spanId: string): MessageAnchor | undefined =>
  new URLSearchParams(search).get("spanId") === spanId ? parseAnchorHash(hash) : undefined;

export const anchorHash = ({ section, index }: MessageAnchor) => `#${section}-${index}`;

/** Input messages before this call's new input fold behind the history toggle. */
export const isFoldedAnchor = (turn: SpanTurn, anchor: MessageAnchor) =>
  hasContextFold(turn) && anchor.section === "input" && anchor.index < anchorOf(turn, "input", 0).index;

/** The row showing the anchored message: the last one at or before it, since a merged card holds later ones. */
export const findAnchorRow = (rows: ConversationRow[], anchor: MessageAnchor): number =>
  rows.findLastIndex(
    (row) => row.kind === "message" && row.anchor.section === anchor.section && row.anchor.index <= anchor.index
  );
