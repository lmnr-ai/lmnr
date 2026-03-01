"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { compact } from "lodash";
import { Loader } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { useBatchedSpanOutputs } from "@/components/traces/trace-view/list/use-batched-span-outputs";
import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 470;

import DiffSpanPanel from "./diff-span-panel";
import DiffSpanRow, { SpanCell } from "./diff-span-row";
import { useTraceDiffStore } from "./trace-diff-store";
import { type DiffRow } from "./trace-diff-types";
import TraceSelectorTable from "./trace-selector-table";

type SelectingSide = "left" | "right" | null;

interface DiffColumnsProps {
  onSelectLeft: (traceId: string) => void;
  onSelectRight: (traceId: string) => void;
}

function SingleColumnSpanList({
  spans,
  traceRef,
}: {
  spans: TraceViewListSpan[];
  traceRef?: { id: string; startTime: string; endTime: string };
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const spanIds = useMemo(() => spans.map((s) => s.spanId), [spans]);
  const { outputs } = useBatchedSpanOutputs(projectId, spanIds, traceRef ?? {});

  return (
    <div className="flex-1 overflow-y-auto styled-scrollbar p-0.5 flex flex-col gap-0.5">
      {spans.map((span) => (
        <div key={span.spanId} className="bg-secondary rounded-sm">
          <SpanCell span={span} output={outputs[span.spanId]} />
        </div>
      ))}
    </div>
  );
}

export default function DiffColumns({ onSelectLeft, onSelectRight }: DiffColumnsProps) {
  const {
    phase,
    leftListSpans,
    rightListSpans,
    alignedRows,
    selectedRowIndex,
    selectRow,
    leftTrace,
    rightTrace,
    isMappingLoading,
  } = useTraceDiffStore((s) => ({
    phase: s.phase,
    leftListSpans: s.leftListSpans,
    rightListSpans: s.rightListSpans,
    alignedRows: s.alignedRows,
    selectedRowIndex: s.selectedRowIndex,
    selectRow: s.selectRow,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
    isMappingLoading: s.isMappingLoading,
  }));

  const [selectingSide, setSelectingSide] = useState<SelectingSide>(phase === "selecting" ? "right" : null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasPanel = selectedRowIndex !== null;

  const handlePanelResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, startWidth + delta));
        setPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelWidth]
  );

  const handleRowClick = useCallback(
    (index: number) => {
      selectRow(selectedRowIndex === index ? null : index);
    },
    [selectRow, selectedRowIndex]
  );

  const handleSelect = useCallback(
    (traceId: string) => {
      if (selectingSide === "left") {
        onSelectLeft(traceId);
      } else {
        onSelectRight(traceId);
      }
      setSelectingSide(null);
    },
    [selectingSide, onSelectLeft, onSelectRight]
  );

  const excludeTraceId = selectingSide === "left" ? rightTrace?.id : leftTrace?.id;

  // Phase: selecting or user clicked change-trace
  if (phase === "selecting" || selectingSide !== null) {
    const showSelectorOnLeft = selectingSide === "left";
    const showSelectorOnRight = selectingSide === "right" || (phase === "selecting" && selectingSide === null);

    return (
      <div className="flex flex-1 overflow-hidden border-t">
        {/* Left column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showSelectorOnLeft ? (
            <TraceSelectorTable onSelect={handleSelect} excludeTraceId={excludeTraceId} />
          ) : (
            <SingleColumnSpanList
              spans={leftListSpans}
              traceRef={
                leftTrace ? { id: leftTrace.id, startTime: leftTrace.startTime, endTime: leftTrace.endTime } : undefined
              }
            />
          )}
        </div>

        {/* Right column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showSelectorOnRight ? (
            <TraceSelectorTable onSelect={handleSelect} excludeTraceId={excludeTraceId} />
          ) : rightListSpans.length > 0 ? (
            <SingleColumnSpanList
              spans={rightListSpans}
              traceRef={
                rightTrace
                  ? { id: rightTrace.id, startTime: rightTrace.startTime, endTime: rightTrace.endTime }
                  : undefined
              }
            />
          ) : null}
        </div>
      </div>
    );
  }

  // Phase: loading
  if (phase === "loading" || isMappingLoading) {
    return (
      <div className="flex flex-1 overflow-hidden border-t">
        <SingleColumnSpanList
          spans={leftListSpans}
          traceRef={
            leftTrace ? { id: leftTrace.id, startTime: leftTrace.startTime, endTime: leftTrace.endTime } : undefined
          }
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader className="size-5 animate-spin" />
            <span className="text-sm">Calculating diff...</span>
          </div>
        </div>
      </div>
    );
  }

  // Phase: ready
  return (
    <div className="flex flex-1 overflow-hidden border-t">
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <VirtualizedDiffRows
          scrollRef={scrollRef}
          alignedRows={alignedRows}
          selectedRowIndex={selectedRowIndex}
          onRowClick={handleRowClick}
          leftTrace={
            leftTrace ? { id: leftTrace.id, startTime: leftTrace.startTime, endTime: leftTrace.endTime } : undefined
          }
          rightTrace={
            rightTrace ? { id: rightTrace.id, startTime: rightTrace.startTime, endTime: rightTrace.endTime } : undefined
          }
        />
      </div>
      {hasPanel && (
        <div className="flex-none h-full overflow-hidden relative border-l" style={{ width: panelWidth }}>
          <div
            className="absolute top-0 left-0 h-full cursor-col-resize z-50 group w-2"
            onMouseDown={handlePanelResize}
          >
            <div className="absolute top-0 left-0 h-full w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors" />
          </div>
          <DiffSpanPanel />
        </div>
      )}
    </div>
  );
}

interface TraceRef {
  id: string;
  startTime: string;
  endTime: string;
}

function VirtualizedDiffRows({
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
}) {
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
    <div ref={scrollRef} className="flex-1 overflow-y-auto styled-scrollbar p-0.5">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${items[0]?.start ?? 0}px)`,
          }}
        >
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
}
