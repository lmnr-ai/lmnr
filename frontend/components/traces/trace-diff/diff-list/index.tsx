"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import DiffSpanPanel from "../panel";
import { useTraceDiffStore } from "../store";
import Timeline from "../timeline";
import TraceSelector from "../trace-selector";
import SingleColumnSpanList from "./single-column-span-list";
import VirtualizedDiffRows from "./virtualized-rows";

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 470;

export type SelectingSide = "left" | "right" | null;

interface DiffColumnsProps {
  onSelectLeft: (traceId: string) => void;
  onSelectRight: (traceId: string) => void;
  selectingSide: SelectingSide;
  setSelectingSide: (side: SelectingSide) => void;
}

const DiffColumns = ({ onSelectLeft, onSelectRight, selectingSide, setSelectingSide }: DiffColumnsProps) => {
  const {
    phase,
    leftListSpans,
    rightListSpans,
    alignedRows,
    selectedRowIndex,
    toggleRow,
    leftTrace,
    rightTrace,
    viewMode,
    selectedBlockSpanId,
  } = useTraceDiffStore((s) => ({
    phase: s.phase,
    leftListSpans: s.leftListSpans,
    rightListSpans: s.rightListSpans,
    alignedRows: s.alignedRows,
    selectedRowIndex: s.selectedRowIndex,
    toggleRow: s.toggleRow,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
    viewMode: s.viewMode,
    selectedBlockSpanId: s.selectedBlockSpanId,
  }));

  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasPanel = viewMode === "list" ? selectedRowIndex !== null : selectedBlockSpanId !== null;

  const leftTraceRef = useMemo(
    () => (leftTrace ? { id: leftTrace.id, startTime: leftTrace.startTime, endTime: leftTrace.endTime } : undefined),
    [leftTrace?.id, leftTrace?.startTime, leftTrace?.endTime]
  );
  const rightTraceRef = useMemo(
    () =>
      rightTrace ? { id: rightTrace.id, startTime: rightTrace.startTime, endTime: rightTrace.endTime } : undefined,
    [rightTrace?.id, rightTrace?.startTime, rightTrace?.endTime]
  );

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
      toggleRow(index);
    },
    [toggleRow]
  );

  const handleSelect = useCallback(
    (traceId: string) => {
      if (selectingSide === "left") {
        onSelectLeft(traceId);
      } else if (selectingSide === "right") {
        onSelectRight(traceId);
      }
      setSelectingSide(null);
    },
    [selectingSide, onSelectLeft, onSelectRight, setSelectingSide]
  );

  const excludeTraceId = selectingSide === "left" ? rightTrace?.id : leftTrace?.id;

  // Actively selecting a trace on one side
  if (selectingSide !== null) {
    const showSelectorOnLeft = selectingSide === "left";

    return (
      <div className="flex flex-1 overflow-hidden">
        {/* Left column */}
        <div className="flex-1 flex flex-col overflow-hidden gap-2">
          {showSelectorOnLeft ? (
            <div className="size-full p-2">
              <TraceSelector onSelect={handleSelect} excludeTraceId={excludeTraceId} />
            </div>
          ) : (
            <SingleColumnSpanList spans={leftListSpans} traceRef={leftTraceRef} />
          )}
        </div>

        {/* Right column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!showSelectorOnLeft ? (
            <div className="size-full p-2">
              <TraceSelector onSelect={handleSelect} excludeTraceId={excludeTraceId} />
            </div>
          ) : rightListSpans.length > 0 ? (
            <SingleColumnSpanList spans={rightListSpans} traceRef={rightTraceRef} />
          ) : null}
        </div>
      </div>
    );
  }

  // Phase: selecting (initial state, no right trace yet)
  if (phase === "selecting") {
    return (
      <div className="flex flex-1 overflow-hidden border-t gap-2">
        <div className="flex-1 flex flex-col overflow-hidden">
          <SingleColumnSpanList spans={leftListSpans} traceRef={leftTraceRef} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <TraceSelector onSelect={onSelectRight} excludeTraceId={leftTrace?.id} />
        </div>
      </div>
    );
  }

  // Timeline mode works independently of mapping — show it regardless of phase
  if (viewMode === "timeline") {
    return (
      <div className="flex flex-1 overflow-hidden border-t">
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Timeline />
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

  // Phase: error or loading — show span lists side by side (status bar is in parent)
  if (phase === "error" || phase === "loading") {
    return (
      <div className="flex flex-1 overflow-hidden gap-2">
        <div className="flex-1 flex flex-col overflow-hidden pl-4">
          <SingleColumnSpanList spans={leftListSpans} traceRef={leftTraceRef} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden pr-4">
          <SingleColumnSpanList spans={rightListSpans} traceRef={rightTraceRef} />
        </div>
      </div>
    );
  }

  // Phase: ready — list mode
  return (
    <div className="flex flex-1 overflow-hidden border-t">
      <div className={cn("flex flex-col flex-1 overflow-hidden min-w-0", { "px-4": !hasPanel })}>
        <VirtualizedDiffRows
          scrollRef={scrollRef}
          alignedRows={alignedRows}
          selectedRowIndex={selectedRowIndex}
          onRowClick={handleRowClick}
          leftTrace={leftTraceRef}
          rightTrace={rightTraceRef}
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
};

export default DiffColumns;
