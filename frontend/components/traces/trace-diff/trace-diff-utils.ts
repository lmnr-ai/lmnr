import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";

import { type DiffRow, type SpanMapping } from "./trace-diff-types";

/**
 * Align two lists of spans into DiffRows based on the provided mapping.
 *
 * Two-pointer merge: walks both lists in order. Matched pairs are aligned
 * on the same row; unmatched spans become left-only or right-only rows.
 */
export const computeAlignedRows = (
  leftSpans: TraceViewListSpan[],
  rightSpans: TraceViewListSpan[],
  mapping: SpanMapping
): DiffRow[] => {
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
          // This right span is matched to a later left span — skip for now
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

  // Emit any remaining right spans not yet emitted (unmatched ones)
  for (; ri < rightSpans.length; ri++) {
    const r = rightSpans[ri];
    if (!emittedRight.has(r.spanId) && !rightIdToLeft.has(r.spanId)) {
      rows.push({ type: "right-only", right: r });
      emittedRight.add(r.spanId);
    }
  }

  // Catch any unmatched right spans that were skipped earlier (before ri's position)
  for (const r of rightSpans) {
    if (!emittedRight.has(r.spanId) && !rightIdToLeft.has(r.spanId)) {
      rows.push({ type: "right-only", right: r });
    }
  }

  return rows;
};
