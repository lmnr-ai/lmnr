import React, { memo, useCallback, useEffect, useRef, useState } from "react";

import { type CondensedTimelineSpan } from "@/components/traces/trace-view/store/utils";

import { ROW_HEIGHT } from "./condensed-timeline-element";

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
  onSelectionComplete: (spanIds: Set<string>) => void;
}

const DRAG_THRESHOLD = 5;

const SelectionOverlay = ({ spans, containerRef, onSelectionComplete }: SelectionOverlayProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const isTracking = useRef(false);

  const getRelativePosition = useCallback(
    (e: MouseEvent): { x: number; y: number } | null => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      // Clamp to container bounds so selection stays within container when dragging outside
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      return { x, y };
    },
    [containerRef]
  );

  const isPointInContainer = useCallback(
    (e: MouseEvent): boolean => {
      if (!containerRef.current) return false;
      const rect = containerRef.current.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    },
    [containerRef]
  );

  const findSpansInRect = useCallback(
    (rect: SelectionRect): Set<string> => {
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
          spanLeft < maxX && spanLeft + spanWidth > minX && spanTop < maxY && spanTop + spanHeight > minY;

        if (intersects) {
          selectedIds.add(span.span.spanId);
        }
      }

      return selectedIds;
    },
    [spans, containerRef]
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      if (!isPointInContainer(e)) return; // Only start if within container

      const pos = getRelativePosition(e);
      if (!pos) return;

      startPos.current = pos;
      isTracking.current = true;
      setSelectionRect({
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
      });
    },
    [getRelativePosition, isPointInContainer]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isTracking.current || !startPos.current) return;

      const pos = getRelativePosition(e);
      if (!pos) return;

      const distance = Math.sqrt(Math.pow(pos.x - startPos.current.x, 2) + Math.pow(pos.y - startPos.current.y, 2));

      // Only show selection rect once drag threshold is exceeded
      if (distance > DRAG_THRESHOLD) {
        setIsDragging(true);
      }

      setSelectionRect((prev) =>
        prev
          ? {
              ...prev,
              endX: pos.x,
              endY: pos.y,
            }
          : null
      );
    },
    [getRelativePosition]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && selectionRect) {
      const selectedIds = findSpansInRect(selectionRect);
      if (selectedIds.size > 0) {
        onSelectionComplete(selectedIds);
      }
    }

    // Reset state
    setIsDragging(false);
    setSelectionRect(null);
    startPos.current = null;
    isTracking.current = false;
  }, [isDragging, selectionRect, findSpansInRect, onSelectionComplete]);

  // Attach document-level listeners to track drag selection
  useEffect(() => {
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  // Calculate selection rectangle display
  const displayRect =
    selectionRect && isDragging
      ? {
          left: Math.min(selectionRect.startX, selectionRect.endX),
          top: Math.min(selectionRect.startY, selectionRect.endY),
          width: Math.abs(selectionRect.endX - selectionRect.startX),
          height: Math.abs(selectionRect.endY - selectionRect.startY),
        }
      : null;

  // Only render the selection rect when dragging, with pointer-events: none
  // so clicks pass through to span elements
  if (!displayRect) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <div
        className="absolute bg-primary/20 border border-primary/50"
        style={{
          left: displayRect.left,
          top: displayRect.top,
          width: displayRect.width,
          height: displayRect.height,
        }}
      />
    </div>
  );
};

export default memo(SelectionOverlay);
