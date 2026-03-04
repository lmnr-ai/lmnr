"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import DiffSpanPanel from "./diff-span-panel";
import MappingError from "./mapping-error";
import SingleColumnSpanList from "./single-column-span-list";
import { useTraceDiffStore } from "./trace-diff-store";
import TraceSelector from "./trace-selector";
import VirtualizedDiffRows from "./virtualized-diff-rows";

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
    isMappingLoading,
    mappingError,
    retryMapping,
  } = useTraceDiffStore((s) => ({
    phase: s.phase,
    leftListSpans: s.leftListSpans,
    rightListSpans: s.rightListSpans,
    alignedRows: s.alignedRows,
    selectedRowIndex: s.selectedRowIndex,
    toggleRow: s.toggleRow,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
    isMappingLoading: s.isMappingLoading,
    mappingError: s.mappingError,
    retryMapping: s.retryMapping,
  }));

  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasPanel = selectedRowIndex !== null;

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

  // Phase: error (mapping failed)
  if (phase === "error") {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <MappingError error={mappingError ?? "Failed to analyze trace diff"} onRetry={retryMapping} />
        <div className="flex flex-1 overflow-hidden gap-2">
          <div className="flex-1 flex flex-col overflow-hidden pl-4">
            <SingleColumnSpanList spans={leftListSpans} traceRef={leftTraceRef} />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden pr-4">
            <SingleColumnSpanList spans={rightListSpans} traceRef={rightTraceRef} />
          </div>
        </div>
      </div>
    );
  }

  // Phase: loading (right trace selected, mapping in progress)
  if (phase === "loading" || isMappingLoading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-none flex items-center justify-center py-2 bg-secondary border-b border-b-background">
          <span className="text-sm text-muted-foreground shimmer">Analyzing trace diff</span>
        </div>
        <div className="flex flex-1 overflow-hidden gap-2">
          <div className="flex-1 flex flex-col overflow-hidden pl-4">
            <SingleColumnSpanList spans={leftListSpans} traceRef={leftTraceRef} />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden pr-4">
            <SingleColumnSpanList spans={rightListSpans} traceRef={rightTraceRef} />
          </div>
        </div>
      </div>
    );
  }

  // Phase: ready
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
