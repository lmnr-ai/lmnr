import { type ChartPoint, type ChartScene } from "@tanstack/charts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { isValidZoomRange, normalizeTimeRange } from "@/lib/charts/time";

import { type TraceSeriesRow } from "./definition";

type Scene = ChartScene<TraceSeriesRow, string, number>;
type Selection = { start: string; end: string };

export const useTracesZoom = () => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const focusedX = useRef<string | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  const onFocusChange = useCallback((point: ChartPoint<TraceSeriesRow, string, number> | null) => {
    focusedX.current = point?.datum.x ?? null;
    if (selectionRef.current && focusedX.current) {
      const next = { start: selectionRef.current.start, end: focusedX.current };
      selectionRef.current = next;
      setSelection(next);
    }
  }, []);

  const onPointerDown = useCallback(() => {
    if (focusedX.current) {
      selectionRef.current = { start: focusedX.current, end: focusedX.current };
      setSelection(selectionRef.current);
    }
  }, []);

  const onRender = useCallback(({ scene: next }: { scene: Scene }) => {
    setScene((prev) =>
      prev && prev.width === next.width && prev.height === next.height && prev.points.length === next.points.length
        ? prev
        : next
    );
  }, []);

  const isSelecting = selection !== null;
  useEffect(() => {
    if (!isSelecting) return;
    const finish = () => {
      const range = selectionRef.current;
      selectionRef.current = null;
      setSelection(null);
      if (!range || !isValidZoomRange(range.start, range.end)) return;
      const { start, end } = normalizeTimeRange(range.start, range.end);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("pastHours");
      params.set("startDate", start);
      params.set("endDate", end);
      router.push(`${pathName}?${params.toString()}`);
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [isSelecting, pathName, router, searchParams]);

  let overlay: { left: number; width: number; top: number; height: number } | null = null;
  const x = scene?.scales.x;
  if (selection && x && scene && selection.start !== selection.end) {
    const [left, right] = [x.map(selection.start), x.map(selection.end)].sort((a, b) => a - b);
    overlay = { left, width: right - left + x.bandwidth, top: scene.chart.y, height: scene.chart.height };
  }
  return { onFocusChange, onPointerDown, onRender, overlay };
};
