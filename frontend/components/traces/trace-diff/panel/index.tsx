"use client";

import { X } from "lucide-react";
import { useMemo } from "react";

import { SpanView } from "@/components/traces/span-view";
import { Button } from "@/components/ui/button";

import { useTraceDiffStore } from "../store";
import MatchedSpanDiff from "./matched-span-diff";

const DiffSpanPanel = () => {
  const {
    selectedRowIndex,
    alignedRows,
    clearSelection,
    leftTrace,
    rightTrace,
    viewMode,
    selectedBlockSpanId,
    selectedBlockSide,
    clearBlockSelection,
    spanMapping,
  } = useTraceDiffStore((s) => ({
    selectedRowIndex: s.selectedRowIndex,
    alignedRows: s.alignedRows,
    clearSelection: s.clearSelection,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
    viewMode: s.viewMode,
    selectedBlockSpanId: s.selectedBlockSpanId,
    selectedBlockSide: s.selectedBlockSide,
    clearBlockSelection: s.clearBlockSelection,
    spanMapping: s.spanMapping,
  }));

  // Build a lookup from spanId → matched spanId on the other side
  const matchLookup = useMemo(() => {
    const map = new Map<string, { matchedSpanId: string; matchSide: "left" | "right" }>();
    for (const [leftId, rightId] of spanMapping) {
      map.set(leftId, { matchedSpanId: rightId, matchSide: "right" });
      map.set(rightId, { matchedSpanId: leftId, matchSide: "left" });
    }
    return map;
  }, [spanMapping]);

  // Timeline mode: show MatchedSpanDiff if the span has a match, otherwise SpanView
  if (viewMode === "timeline") {
    if (!selectedBlockSpanId || !selectedBlockSide) return null;

    const traceId = selectedBlockSide === "left" ? leftTrace?.id : rightTrace?.id;
    if (!traceId) return null;

    const match = matchLookup.get(selectedBlockSpanId);
    if (match && leftTrace && rightTrace) {
      const leftSpanId = selectedBlockSide === "left" ? selectedBlockSpanId : match.matchedSpanId;
      const rightSpanId = selectedBlockSide === "right" ? selectedBlockSpanId : match.matchedSpanId;
      return (
        <div className="flex flex-col h-full w-full overflow-hidden">
          <MatchedSpanDiff
            leftTraceId={leftTrace.id}
            leftSpanId={leftSpanId}
            rightTraceId={rightTrace.id}
            rightSpanId={rightSpanId}
            onClose={clearBlockSelection}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex justify-end px-2 pt-2 flex-shrink-0">
          <Button variant="ghost" size="icon" className="size-6" onClick={clearBlockSelection}>
            <X className="size-3.5" />
          </Button>
        </div>
        <SpanView spanId={selectedBlockSpanId} traceId={traceId} />
      </div>
    );
  }

  // List mode
  if (selectedRowIndex === null) return null;

  const row = alignedRows[selectedRowIndex];
  if (!row) return null;

  // Matched: show comparison view
  if (row.type === "matched") {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {leftTrace && rightTrace && (
          <MatchedSpanDiff
            leftTraceId={leftTrace.id}
            leftSpanId={row.left.spanId}
            rightTraceId={rightTrace.id}
            rightSpanId={row.right.spanId}
            onClose={clearSelection}
          />
        )}
      </div>
    );
  }

  // Unmatched: show regular SpanView (no extra header — SpanView has its own)
  const span = row.type === "left-only" ? row.left : row.right;
  const traceId = row.type === "left-only" ? leftTrace?.id : rightTrace?.id;

  if (!traceId) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-end px-2 pt-2 flex-shrink-0">
        <Button variant="ghost" size="icon" className="size-6" onClick={clearSelection}>
          <X className="size-3.5" />
        </Button>
      </div>
      <SpanView spanId={span.spanId} traceId={traceId} />
    </div>
  );
};

export default DiffSpanPanel;
