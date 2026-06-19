/**
 * Matches markdown-style trace/span links embedded in text. These are emitted by
 * `app-server/src/signals/utils.rs` in signal event payloads and similar places:
 *
 *   [Label](https://lmnr.ai/project/<pid>/traces/<traceId>?spanId=<uuid>&chat=true)
 *   [Label](https://www.laminar.sh/project/<pid>/traces/<traceId>?spanId=<uuid>)
 *   [Label](https://www.laminar.sh/project/<pid>/traces/<traceId>)
 *
 * `spanId` is optional. Any extra query params (e.g. `chat=true`) are tolerated.
 */
const SPAN_LINK_REGEX =
  /\[([^\]]+)\]\(https?:\/\/(?:www\.)?(?:lmnr\.ai|laminar\.sh)\/project\/[0-9a-f-]+\/traces\/([0-9a-f-]+)(?:\?[^)]*?spanId=([0-9a-f-]+))?[^)]*\)/gi;

export interface SpanLinkMatch {
  label: string;
  traceId: string;
  spanId?: string;
  index: number;
  length: number;
}

/**
 * Scan `text` for markdown-formatted trace/span links and return structured
 * matches sorted by position. Callers render each match however they like
 * (e.g. as a trace-drawer opener in the signals events table, or as a
 * span-selector badge in the trace-view chat).
 */
export function parseSpanLinks(text: string): SpanLinkMatch[] {
  const matches: SpanLinkMatch[] = [];
  const regex = new RegExp(SPAN_LINK_REGEX.source, SPAN_LINK_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [fullMatch, label, traceId, spanId] = match;
    matches.push({
      label,
      traceId,
      spanId,
      index: match.index,
      length: fullMatch.length,
    });
  }

  return matches;
}
