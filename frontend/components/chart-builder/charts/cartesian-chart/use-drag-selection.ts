import { type ChartPoint, type ChartScene } from "@tanstack/charts";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { useDashboardSelectionStore } from "@/components/dashboards/dashboard-selection-store";

import { type SeriesRow } from "./definition";

type Scene = ChartScene<SeriesRow, string, number>;

/**
 * Drag to select a time range, written into the dashboard selection store.
 * Not `brushX`: its d3 overlay swallows hover, which kills the tooltip.
 */
export const useDragSelection = (chartId: string) => {
  const { owner, startLabel, endLabel, isDragging, startDrag, updateDrag, endDrag } = useDashboardSelectionStore(
    (s) => ({
      owner: s.chartId,
      startLabel: s.startLabel,
      endLabel: s.endLabel,
      isDragging: s.isDragging,
      startDrag: s.startDrag,
      updateDrag: s.updateDrag,
      endDrag: s.endDrag,
    })
  );
  const isOwner = owner === chartId;
  const focusedX = useRef<string | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  const onFocusChange = useCallback(
    (point: ChartPoint<SeriesRow, string, number> | null) => {
      focusedX.current = point?.datum.x ?? null;
      if (isOwner && isDragging && focusedX.current) updateDrag(focusedX.current);
    },
    [isOwner, isDragging, updateDrag]
  );

  // Only geometry changes matter to the overlay; skipping the rest avoids a render per paint.
  const onRender = useCallback(({ scene: next }: { scene: Scene }) => {
    setScene((prev) =>
      prev && prev.width === next.width && prev.height === next.height && prev.points.length === next.points.length
        ? prev
        : next
    );
  }, []);

  const onPointerDown = useCallback(() => {
    if (focusedX.current) startDrag(chartId, focusedX.current);
  }, [chartId, startDrag]);

  // On window, not the wrapper, so releasing outside the chart still ends the drag. Pointer capture
  // would retarget the moves the chart needs to keep updating focus.
  useEffect(() => {
    if (!isOwner || !isDragging) return;
    window.addEventListener("pointerup", endDrag);
    return () => window.removeEventListener("pointerup", endDrag);
  }, [isOwner, isDragging, endDrag]);

  // A full-height box from the start value to the end value.
  let overlay: CSSProperties | null = null;
  const x = scene?.scales.x;
  if (isOwner && startLabel && endLabel && x && scene) {
    const [a, b] = [x.map(startLabel), x.map(endLabel)].sort((l, r) => l - r);
    const { chart } = scene;
    overlay = { left: a, width: b - a + x.bandwidth, top: chart.y, height: chart.height };
  }

  return { onFocusChange, onRender, onPointerDown, overlay };
};

export type DragSelection = ReturnType<typeof useDragSelection>;
