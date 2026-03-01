import { type TraceViewListSpan, type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { computePathInfoMap } from "@/components/traces/trace-view/store/utils";

import { type DiffRow, type SpanMapping } from "./trace-diff-types";

/**
 * Convert raw TraceViewSpan[] into the lightweight TraceViewListSpan[] format
 * used by the reader list view. Filters out DEFAULT spans and attaches pathInfo.
 */
export function toListSpans(spans: TraceViewSpan[]): TraceViewListSpan[] {
  const listSpans = spans.filter((span) => span.spanType !== "DEFAULT");
  const pathInfoMap = computePathInfoMap(spans);

  return listSpans.map((span) => ({
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    spanType: span.spanType,
    name: span.name,
    model: span.model,
    startTime: span.startTime,
    endTime: span.endTime,
    totalTokens: span.totalTokens,
    cacheReadInputTokens: span.cacheReadInputTokens,
    totalCost: span.totalCost,
    pending: span.pending,
    pathInfo: pathInfoMap.get(span.spanId) ?? null,
  }));
}

/**
 * Align two lists of spans into DiffRows based on the provided mapping.
 *
 * Two-pointer merge: walks both lists in order. Matched pairs are aligned
 * on the same row; unmatched spans become left-only or right-only rows.
 */
export function computeAlignedRows(
  leftSpans: TraceViewListSpan[],
  rightSpans: TraceViewListSpan[],
  mapping: SpanMapping
): DiffRow[] {
  const leftIdToRight = new Map<string, string>();
  const rightIdToLeft = new Map<string, string>();

  for (const [leftId, rightId] of mapping) {
    leftIdToRight.set(leftId, rightId);
    rightIdToLeft.set(rightId, leftId);
  }

  const rightSpanMap = new Map(rightSpans.map((s) => [s.spanId, s]));

  const rows: DiffRow[] = [];
  const emittedRight = new Set<string>();

  let ri = 0;

  for (const left of leftSpans) {
    const matchedRightId = leftIdToRight.get(left.spanId);

    if (matchedRightId) {
      // Emit any unmatched right spans that come before the matched right span
      while (ri < rightSpans.length && rightSpans[ri].spanId !== matchedRightId) {
        const r = rightSpans[ri];
        if (!rightIdToLeft.has(r.spanId)) {
          rows.push({ type: "right-only", right: r });
          emittedRight.add(r.spanId);
        } else {
          // This right span is matched to a later left span — skip it for now,
          // it will be emitted when we reach that left span
          break;
        }
        ri++;
      }

      const rightSpan = rightSpanMap.get(matchedRightId);
      if (rightSpan) {
        rows.push({ type: "matched", left, right: rightSpan });
        emittedRight.add(matchedRightId);
        // Advance ri past the matched span
        if (ri < rightSpans.length && rightSpans[ri].spanId === matchedRightId) {
          ri++;
        }
      } else {
        rows.push({ type: "left-only", left });
      }
    } else {
      rows.push({ type: "left-only", left });
    }
  }

  // Emit any remaining right-only spans
  for (; ri < rightSpans.length; ri++) {
    const r = rightSpans[ri];
    if (!emittedRight.has(r.spanId)) {
      rows.push({ type: "right-only", right: r });
    }
  }

  // Also catch any right spans that were skipped entirely
  for (const r of rightSpans) {
    if (!emittedRight.has(r.spanId) && !rightIdToLeft.has(r.spanId)) {
      rows.push({ type: "right-only", right: r });
    }
  }

  return rows;
}

/**
 * Get display name for a span — model name for LLM spans, otherwise span name.
 */
export function getSpanDisplayName(span: TraceViewListSpan): string {
  if (span.spanType === "LLM" && span.model) {
    return span.model;
  }
  return span.name;
}
