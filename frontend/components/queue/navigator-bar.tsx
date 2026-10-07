"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, Circle, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { type QueueItemState } from "@/lib/actions/queue";
import { cn } from "@/lib/utils";

import { useQueueStore } from "./queue-store";

/**
 * Color tokens are mirrored between the bar (background) and the legend
 * (foreground icon). Keep them in sync so a green segment on the bar reads
 * as the same state as the green ✓ in the legend.
 */
const STATE_BG: Record<QueueItemState, string> = {
  new: "bg-muted-foreground/30",
  modified: "bg-amber-500",
  approved: "bg-success-bright",
};

const MIN_SEGMENT_PX = 6;
const SEGMENT_GAP_PX = 1;
const CURSOR_PAD_PX = 2;

export default function NavigatorBar() {
  const idsList = useQueueStore((s) => s.idsList);
  const itemStates = useQueueStore((s) => s.itemStates);
  const currentIndex = useQueueStore((s) => s.currentIndex);
  const setCurrentIndex = useQueueStore((s) => s.setCurrentIndex);
  const progress = useQueueStore((s) => s.progress);

  const total = idsList.length;

  const barRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const lastDragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setBarWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const indexFromClientX = useCallback(
    (clientX: number): number | null => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || total === 0) return null;
      const ratio = (clientX - rect.left) / rect.width;
      return Math.min(total - 1, Math.max(0, Math.floor(ratio * total)));
    },
    [total]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      const idx = indexFromClientX(e.clientX);
      if (idx === null) return;
      setHoverIndex(idx);
      if (lastDragIndexRef.current === idx) return;
      lastDragIndexRef.current = idx;
      setCurrentIndex(idx);
    };
    const onUp = () => {
      setIsDragging(false);
      lastDragIndexRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, indexFromClientX, setCurrentIndex]);

  if (total === 0) {
    return null;
  }

  const totalGapPx = Math.max(0, (total - 1) * SEGMENT_GAP_PX);
  const enforceMin = barWidth > 0 && total * MIN_SEGMENT_PX + totalGapPx <= barWidth;
  const segmentWidth = barWidth > 0 ? Math.max(0, (barWidth - totalGapPx) / total) : 0;
  const segmentStride = segmentWidth + SEGMENT_GAP_PX;
  const hoverPct = hoverIndex === null ? null : ((hoverIndex + 0.5) / total) * 100;

  return (
    <div className="flex h-full items-center gap-4 flex-1 min-w-0">
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentIndex + 1}
        aria-label="Queue navigator"
        className="relative flex-1 min-w-0 h-2.5 cursor-pointer select-none touch-none outline-0 group"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const idx = indexFromClientX(e.clientX);
          if (idx === null) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setHoverIndex(idx);
          lastDragIndexRef.current = idx;
          setCurrentIndex(idx);
          setIsDragging(true);
        }}
        onPointerMove={(e) => {
          if (isDragging) return;
          const idx = indexFromClientX(e.clientX);
          setHoverIndex(idx);
        }}
        onPointerLeave={() => {
          if (!isDragging) setHoverIndex(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" && currentIndex > 0) {
            e.preventDefault();
            setCurrentIndex(currentIndex - 1);
          } else if (e.key === "ArrowRight" && currentIndex < total - 1) {
            e.preventDefault();
            setCurrentIndex(currentIndex + 1);
          }
        }}
      >
        <TooltipPrimitive.Provider delayDuration={0}>
          <TooltipPrimitive.Root open={hoverIndex !== null && !isDragging}>
            <TooltipPrimitive.Trigger asChild>
              <div
                className="pointer-events-none absolute top-0 bottom-0"
                style={{
                  left: hoverPct === null ? "0%" : `${hoverPct}%`,
                  width: 1,
                  transform: "translateX(-0.5px)",
                }}
              />
            </TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
              <TooltipPrimitive.Content
                side="top"
                sideOffset={8}
                className="z-50 whitespace-nowrap rounded-md border bg-popover px-1.5 py-0.5 text-[10px] tabular-nums text-popover-foreground shadow-sm"
              >
                {(hoverIndex ?? 0) + 1}
              </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
          </TooltipPrimitive.Root>
        </TooltipPrimitive.Provider>

        <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-border" style={{ gap: `${SEGMENT_GAP_PX}px` }}>
          {idsList.map((id) => {
            const state = itemStates[id] ?? "new";
            return (
              <div
                key={id}
                className={cn("h-full flex-1 min-w-0 transition-colors duration-150", STATE_BG[state])}
                style={enforceMin ? { minWidth: `${MIN_SEGMENT_PX}px` } : undefined}
              />
            );
          })}
        </div>

        {barWidth > 0 && hoverIndex !== null && hoverIndex !== currentIndex && !isDragging && (
          <div
            className="pointer-events-none absolute -top-0.5 -bottom-0.5 rounded-sm border border-muted-foreground/50 transition-[left,width,opacity] duration-150 ease-out opacity-0 group-hover:opacity-100"
            style={{
              left: `${hoverIndex * segmentStride - CURSOR_PAD_PX / 2}px`,
              width: `${segmentWidth + CURSOR_PAD_PX}px`,
            }}
          />
        )}

        {barWidth > 0 && (
          <div
            className="pointer-events-none absolute -top-0.5 -bottom-0.5 rounded-sm border border-muted-foreground bg-background/10 shadow-sm transition-[left,width] duration-150 ease-out"
            style={{
              left: `${currentIndex * segmentStride - CURSOR_PAD_PX}px`,
              width: `${segmentWidth + CURSOR_PAD_PX * 2}px`,
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-1 text-xs text-secondary-foreground tabular-nums shrink-0 whitespace-nowrap">
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted/50 transition-colors">
          <Circle className="size-2.5 text-muted-foreground" />
          {progress.new}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted/50 transition-colors">
          <Pencil className="size-2.5 text-amber-500" />
          {progress.modified}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted/50 transition-colors">
          <Check className="size-2.5 text-success-bright" />
          {progress.approved}
        </span>
      </div>
    </div>
  );
}
