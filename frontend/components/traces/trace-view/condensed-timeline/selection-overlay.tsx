import React, { memo, useCallback, useRef, useState } from "react";

import { type CondensedTimelineSpan } from "@/components/traces/trace-view/trace-view-store-utils";

import { ROW_HEIGHT } from "./condensed-timeline-element";

type SelectionState = "idle" | "pending" | "dragging";

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface SelectionOverlayProps {
  spans: CondensedTimelineSpan[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onSingleClick: (spanId: string) => void;
  onSelectionComplete: (spanIds: Set<string>) => void;
}

const DRAG_THRESHOLD = 5;

const SelectionOverlay = ({
  spans,
  containerRef,
  scrollContainerRef,
  onSingleClick,
  onSelectionComplete,
}: SelectionOverlayProps) => {
  const [state, setState] = useState<SelectionState>("idle");
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const clickedSpanId = useRef<string | null>(null);

  const getRelativePosition = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, [containerRef]);

  const findSpanAtPosition = useCallback((x: number, y: number): string | null => {
    if (!containerRef.current) return null;
    const containerWidth = containerRef.current.clientWidth;

    for (const span of spans) {
      const spanLeft = (span.left / 100) * containerWidth;
      const spanWidth = Math.max((span.width / 100) * containerWidth, 4);
      const spanTop = span.row * ROW_HEIGHT + 1;
      const spanHeight = ROW_HEIGHT - 2;

      if (
        x >= spanLeft &&
        x <= spanLeft + spanWidth &&
        y >= spanTop &&
        y <= spanTop + spanHeight
      ) {
        return span.span.spanId;
      }
    }
    return null;
  }, [spans, containerRef]);

  const findSpansInRect = useCallback((rect: SelectionRect): Set<string> => {
    if (!containerRef.current) return new Set();
    const containerWidth = containerRef.current.clientWidth;

    const minX = Math.min(rect.startX, rect.endX);
    const maxX = Math.max(rect.startX, rect.endX);
    const minY = Math.min(rect.startY, rect.endY);
    const maxY = Math.max(rect.startY, rect.endY);

    const selectedIds = new Set<string>();

    for (const span of spans) {
      const spanLeft = (span.left / 100) * containerWidth;
      const spanWidth = Math.max((span.width / 100) * containerWidth, 4);
      const spanTop = span.row * ROW_HEIGHT + 1;
      const spanHeight = ROW_HEIGHT - 2;

      // Check for intersection
      const intersects =
        spanLeft < maxX &&
        spanLeft + spanWidth > minX &&
        spanTop < maxY &&
        spanTop + spanHeight > minY;

      if (intersects) {
        selectedIds.add(span.span.spanId);
      }
    }

    return selectedIds;
  }, [spans, containerRef]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    const pos = getRelativePosition(e);
    startPos.current = pos;
    clickedSpanId.current = findSpanAtPosition(pos.x, pos.y);
    setState("pending");
    setSelectionRect({
      startX: pos.x,
      startY: pos.y,
      endX: pos.x,
      endY: pos.y,
    });
  }, [getRelativePosition, findSpanAtPosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (state === "idle" || !startPos.current) return;

    const pos = getRelativePosition(e);
    const distance = Math.sqrt(
      Math.pow(pos.x - startPos.current.x, 2) +
      Math.pow(pos.y - startPos.current.y, 2)
    );

    if (state === "pending" && distance > DRAG_THRESHOLD) {
      setState("dragging");
    }

    if (state === "pending" || state === "dragging") {
      setSelectionRect((prev) => prev ? {
        ...prev,
        endX: pos.x,
        endY: pos.y,
      } : null);
    }
  }, [state, getRelativePosition]);

  const handleMouseUp = useCallback(() => {
    if (state === "pending") {
      // Single click
      if (clickedSpanId.current) {
        onSingleClick(clickedSpanId.current);
      }
    } else if (state === "dragging" && selectionRect) {
      // Drag complete
      const selectedIds = findSpansInRect(selectionRect);
      if (selectedIds.size > 0) {
        onSelectionComplete(selectedIds);
      }
    }

    // Reset state
    setState("idle");
    setSelectionRect(null);
    startPos.current = null;
    clickedSpanId.current = null;
  }, [state, selectionRect, findSpansInRect, onSingleClick, onSelectionComplete]);

  const handleMouseLeave = useCallback(() => {
    if (state === "dragging" && selectionRect) {
      const selectedIds = findSpansInRect(selectionRect);
      if (selectedIds.size > 0) {
        onSelectionComplete(selectedIds);
      }
    }
    setState("idle");
    setSelectionRect(null);
    startPos.current = null;
    clickedSpanId.current = null;
  }, [state, selectionRect, findSpansInRect, onSelectionComplete]);

  // Calculate selection rectangle display
  const displayRect = selectionRect && state === "dragging" ? {
    left: Math.min(selectionRect.startX, selectionRect.endX),
    top: Math.min(selectionRect.startY, selectionRect.endY),
    width: Math.abs(selectionRect.endX - selectionRect.startX),
    height: Math.abs(selectionRect.endY - selectionRect.startY),
  } : null;

  return (
    <div
      className="absolute inset-0 z-20"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: state === "dragging" ? "crosshair" : "default" }}
    >
      {displayRect && (
        <div
          className="absolute bg-primary/20 border border-primary/50 rounded pointer-events-none"
          style={{
            left: displayRect.left,
            top: displayRect.top,
            width: displayRect.width,
            height: displayRect.height,
          }}
        />
      )}
    </div>
  );
};

export default memo(SelectionOverlay);
