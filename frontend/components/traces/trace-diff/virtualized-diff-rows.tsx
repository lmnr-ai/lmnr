"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { compact } from "lodash";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { useBatchedSpanOutputs } from "@/components/traces/trace-view/list/use-batched-span-outputs";

import DiffSpanRow from "./diff-span-row";
import { type DiffRow } from "./trace-diff-types";

interface TraceRef {
  id: string;
  startTime: string;
  endTime: string;
}

const VirtualizedDiffRows = ({
  scrollRef,
  alignedRows,
  selectedRowIndex,
  onRowClick,
  leftTrace,
  rightTrace,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  alignedRows: DiffRow[];
  selectedRowIndex: number | null;
  onRowClick: (index: number) => void;
  leftTrace?: TraceRef;
  rightTrace?: TraceRef;
}) => {
  const { projectId } = useParams<{ projectId: string }>();

  const virtualizer = useVirtualizer({
    count: alignedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  const { leftVisibleIds, rightVisibleIds } = useMemo(() => {
    const leftIds: string[] = [];
    const rightIds: string[] = [];
    for (const item of items) {
      const row = alignedRows[item.index];
      if (!row) continue;
      if (row.type === "matched") {
        leftIds.push(row.left.spanId);
        rightIds.push(row.right.spanId);
      } else if (row.type === "left-only") {
        leftIds.push(row.left.spanId);
      } else {
        rightIds.push(row.right.spanId);
      }
    }
    return { leftVisibleIds: compact(leftIds), rightVisibleIds: compact(rightIds) };
  }, [items, alignedRows]);

  const { outputs: leftOutputs } = useBatchedSpanOutputs(projectId, leftVisibleIds, {
    id: leftTrace?.id,
    startTime: leftTrace?.startTime,
    endTime: leftTrace?.endTime,
  });

  const { outputs: rightOutputs } = useBatchedSpanOutputs(projectId, rightVisibleIds, {
    id: rightTrace?.id,
    startTime: rightTrace?.startTime,
    endTime: rightTrace?.endTime,
  });

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto styled-scrollbar pt-2">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        <div className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
          {items.map((virtualRow) => {
            const row = alignedRows[virtualRow.index];
            if (!row) return null;

            const leftSpanId = row.type !== "right-only" ? row.left.spanId : undefined;
            const rightSpanId = row.type !== "left-only" ? row.right.spanId : undefined;

            return (
              <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                <DiffSpanRow
                  row={row}
                  index={virtualRow.index}
                  isSelected={selectedRowIndex === virtualRow.index}
                  onClick={onRowClick}
                  leftOutput={leftSpanId ? leftOutputs[leftSpanId] : null}
                  rightOutput={rightSpanId ? rightOutputs[rightSpanId] : null}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VirtualizedDiffRows;
