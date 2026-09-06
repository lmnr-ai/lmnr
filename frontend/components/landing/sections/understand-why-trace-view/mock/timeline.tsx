"use client";

import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";

import { ElevatedSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

import { type MockSpan } from "../../demo-trace";
import { spanColor } from "./span-type-icon";
import TimelineControls from "./timeline-controls";
import { formatTimeMarkerLabel, timelineLayout, timeMarkers } from "./timeline-layout";
import { useElementWidth } from "./use-element-width";

/** One lane of bars. The content is `(totalRows + 1)` of these tall, so there
 *  is always a lane of air under the deepest row. */
const ROW_HEIGHT = 8;

/** Horizontal zoom, as a multiple of the container's width. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 25;
const ZOOM_INCREMENT = 0.5;

interface Props {
  spans: MockSpan[];
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
}

// Every span as a bar, on as few lanes as the parent-child order allows. The
// product's drag-to-filter, subagent boxes and replay needle have nothing to act
// on here, so this keeps only what a reader can see and use.
const Timeline = ({ spans, selectedSpanId, onSelect }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [heatmap, setHeatmap] = useState(false);
  const [needle, setNeedle] = useState<{ left: number; timeMs: number } | null>(null);

  const { bars, totalRows, totalDurationMs } = useMemo(() => timelineLayout(spans), [spans]);
  const containerWidth = useElementWidth(scrollRef);
  const markers = useMemo(
    () => timeMarkers(totalDurationMs, containerWidth * zoom),
    [totalDurationMs, containerWidth, zoom]
  );

  const maxSpanCost = useMemo(() => Math.max(0, ...spans.map((s) => s.totalCost)), [spans]);
  const contentHeight = (totalRows + 1) * ROW_HEIGHT;

  const handleZoom = useCallback((direction: "in" | "out") => {
    const container = scrollRef.current;
    if (!container) return;

    // Zoom about the middle of what is on screen, so the run doesn't slide out
    // from under the pointer.
    const fraction = (container.scrollLeft + container.clientWidth / 2) / container.scrollWidth;
    setZoom((prev) => {
      const next = direction === "in" ? prev + ZOOM_INCREMENT : prev - ZOOM_INCREMENT;
      if (next < MIN_ZOOM || next > MAX_ZOOM) return prev;
      requestAnimationFrame(() => {
        const width = container.clientWidth;
        container.scrollLeft = Math.max(
          0,
          Math.min(fraction * container.scrollWidth - width / 2, container.scrollWidth - width)
        );
      });
      return next;
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setNeedle({
        left: (x / rect.width) * 100,
        timeMs: ((x + container.scrollLeft) / container.scrollWidth) * totalDurationMs,
      });
    },
    [totalDurationMs]
  );

  return (
    <ElevatedSurface offset={2} className="flex flex-col h-full w-full overflow-hidden relative">
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative min-h-0 h-full minimal-scrollbar scroll-fade-t"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setNeedle(null)}
      >
        <div className="px-2 h-full">
          <div className="relative h-full" style={{ width: `${100 * zoom}%`, minHeight: contentHeight }}>
            {/* Grid lines run past the bottom of the content so they read as
                axis rules rather than as a box around the bars. */}
            {markers.map((marker, i) => (
              <div
                key={`line-${i}`}
                className="absolute top-0 bottom-[-60px] w-px pointer-events-none bg-muted"
                style={{ left: `${marker.positionPercent}%` }}
              />
            ))}

            <div className="sticky top-0 z-30 h-6 text-xs pointer-events-none select-none">
              {markers.map((marker, i) => (
                <div
                  key={i}
                  className="absolute flex items-center h-full"
                  style={{ left: `${marker.positionPercent}%` }}
                >
                  <div className="text-secondary-foreground truncate text-[10px] whitespace-nowrap pl-1">
                    {marker.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative h-full" style={{ minHeight: contentHeight }}>
              {bars.map(({ span, left, width, row }) => (
                <div
                  key={span.spanId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(span.spanId);
                  }}
                  className={cn("absolute rounded-xs cursor-pointer hover:brightness-110", {
                    "border border-white/70 z-20": selectedSpanId === span.spanId,
                    "bg-muted": heatmap,
                  })}
                  style={{
                    left: `${left}%`,
                    width: `max(${width}%, 4px)`,
                    top: row * ROW_HEIGHT + 1,
                    height: ROW_HEIGHT - 2,
                    backgroundColor: heatmap ? undefined : spanColor(span),
                  }}
                >
                  {heatmap && (
                    <div
                      className="absolute inset-0 rounded-xs"
                      style={{
                        backgroundColor: `rgba(239, 68, 68, ${maxSpanCost === 0 ? 0 : span.totalCost / maxSpanCost})`,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {needle && (
        <div className="absolute inset-y-0 pointer-events-none z-[35]" style={{ left: `${needle.left}%` }}>
          <div className="absolute top-0 h-6 flex items-center -translate-x-1/2">
            <div className="px-1.5 py-0.5 bg-primary text-white text-[10px] rounded whitespace-nowrap">
              {formatTimeMarkerLabel(Math.round(needle.timeMs))}
            </div>
          </div>
          <div className="absolute top-[6px] bottom-0 w-px bg-primary/50" />
        </div>
      )}

      <TimelineControls
        canZoomIn={zoom < MAX_ZOOM}
        canZoomOut={zoom > MIN_ZOOM}
        onZoom={handleZoom}
        heatmap={heatmap}
        onToggleHeatmap={() => setHeatmap((on) => !on)}
      />
    </ElevatedSurface>
  );
};

export default Timeline;
