import { VirtualItem } from "@tanstack/react-virtual";
import React, { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Span } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

interface Segment {
  left: number;
  width: number;
  span: Span;
  events: SegmentEvent[];
}

interface SegmentEvent {
  id: string;
  name: string;
  left: number;
}

const HEIGHT = 32;

const TimelineElement = ({
  setSelectedSpan,
  segment,
  virtualRow,
  selectedSpan,
}: {
  segment: Segment;
  virtualRow: VirtualItem;
  selectedSpan: null | Span;
  setSelectedSpan: (span: Span | null) => void;
}) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [textPosition, setTextPosition] = useState<"inside" | "outside">("inside");

  const isSelected = useMemo(
    () => selectedSpan?.spanId === segment.span.spanId,
    [segment.span.spanId, selectedSpan?.spanId]
  );

  useLayoutEffect(() => {
    if (!blockRef.current || !textRef.current) return;

    const measure = () => {
      if (textRef.current && blockRef.current) {
        const textWidth = textRef.current.offsetWidth;
        const blockWidth = blockRef.current.offsetWidth + 8;
        const availableWidth = blockWidth - (segment.events.length > 0 ? 16 : 8) - 4;
        setTextPosition(textWidth <= availableWidth ? "inside" : "outside");
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(textRef.current);
    observer.observe(blockRef.current);
    return () => observer.disconnect();
  }, [segment.span.name, segment.events.length, segment.width]);

  return (
    <div
      key={virtualRow.index}
      data-index={virtualRow.index}
      onClick={() => setSelectedSpan(segment.span)}
      className={cn(
        "absolute top-0 left-0 w-full h-8 flex items-center px-4 hover:bg-muted cursor-pointer transition duration-200",
        virtualRow.index % 2 === 0 ? "bg-secondary-foreground/5" : "bg-secondary-foreground/10"
      )}
      style={{
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      {isSelected && <div className="h-full w-full absolute left-0 bg-primary/25" />}
      {segment.left > 50 && textPosition === "outside" && (
        <span
          className="text-xs font-medium text-white/90 truncate absolute"
          style={{
            right: `calc(100% - ${segment.left}% + 16px)`,
            textAlign: "right",
            maxWidth: "200px",
          }}
        >
          {segment.span.name}
        </span>
      )}
      <div
        ref={blockRef}
        className="rounded relative z-20 flex items-center"
        style={{
          backgroundColor: SPAN_TYPE_TO_COLOR[segment.span.spanType],
          marginLeft: segment.left + "%",
          width: `max(${segment.width}%, 2px)`,
          height: 28,
        }}
      >
        {segment.events.map((event, index) => (
          <div
            key={index}
            className="absolute bg-orange-400 w-1 rounded"
            style={{
              left: event.left + "%",
              top: 0,
              height: HEIGHT,
            }}
          />
        ))}
        {textPosition === "inside" && (
          <span
            ref={textRef}
            className="text-xs font-medium text-left text-white/90 truncate absolute"
            style={{
              left: segment.events.length > 0 ? "8px" : "4px",
            }}
          >
            {segment.span.name}
          </span>
        )}
      </div>
      {segment.left <= 50 && textPosition === "outside" && (
        <span className="text-xs ml-2 text-left font-medium text-white/90 truncate">{segment.span.name}</span>
      )}
    </div>
  );
};

export default memo(TimelineElement);
