import { type ChartPoint, type ChartScene } from "@tanstack/charts";
import { useCallback, useEffect, useRef, useState } from "react";

import { type SeriesRow } from "./definition";
import { type ControlledSelection, type PlotRange } from "./types";

type Scene = ChartScene<SeriesRow, string, number>;

export const useRangeSelection = (
  scene: Scene | null,
  onRangeSelect?: (start: string, end: string) => void,
  selection?: ControlledSelection
) => {
  const focused = useRef<string | null>(null);
  const active = useRef<PlotRange | null>(null);
  const [draft, setDraft] = useState<PlotRange | null>(null);
  const [dragging, setDragging] = useState(false);

  const onFocusChange = useCallback(
    (point: ChartPoint<SeriesRow, string, number> | null) => {
      focused.current = point?.datum.x ?? null;
      if (focused.current && active.current) {
        active.current = { ...active.current, end: focused.current };
        if (selection) selection.onChange(active.current, "move");
        else setDraft(active.current);
      }
    },
    [selection]
  );

  const onPointerDown = useCallback(() => {
    if (!focused.current) return;
    const range = { start: focused.current, end: focused.current };
    active.current = range;
    setDragging(true);
    if (selection) selection.onChange(range, "start");
    else setDraft(range);
  }, [selection]);

  useEffect(() => {
    if (!dragging) return;
    const finish = () => {
      const range = active.current;
      active.current = null;
      setDragging(false);
      if (!selection) setDraft(null);
      if (range) {
        selection?.onChange(range, "end");
        onRangeSelect?.(range.start, range.end);
      }
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [dragging, onRangeSelect, selection]);

  const range = selection ? selection.range : draft;
  let overlay: { left: number; width: number; top: number; height: number } | null = null;
  const xScale = scene?.scales.x;
  if (range && xScale && scene && range.start !== range.end) {
    const [left, right] = [xScale.map(range.start), xScale.map(range.end)].sort((a, b) => a - b);
    overlay = { left, width: right - left + xScale.bandwidth, top: scene.chart.y, height: scene.chart.height };
  }
  return { onFocusChange, onPointerDown, overlay };
};
