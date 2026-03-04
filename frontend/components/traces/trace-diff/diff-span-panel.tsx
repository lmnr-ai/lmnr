"use client";

import { SpanView } from "@/components/traces/span-view";

import MatchedSpanDiff from "./matched-span-diff";
import { useTraceDiffStore } from "./trace-diff-store";

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
  }));

  // Timeline mode: show SpanView for the selected block's span
  if (viewMode === "timeline") {
    if (!selectedBlockSpanId || !selectedBlockSide) return null;

    const traceId = selectedBlockSide === "left" ? leftTrace?.id : rightTrace?.id;
    if (!traceId) return null;

    return (
      <div className="flex flex-col h-full overflow-hidden">
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
      <SpanView spanId={span.spanId} traceId={traceId} />
    </div>
  );
};

export default DiffSpanPanel;
