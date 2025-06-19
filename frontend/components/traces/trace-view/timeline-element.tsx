import { VirtualItem } from "@tanstack/react-virtual";
import React, { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Span } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn, getDurationString } from "@/lib/utils";

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
const TEXT_PADDING = {
  WITH_EVENTS: 8,
  WITHOUT_EVENTS: 4,
};

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

    const frameId = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(textRef.current);
    observer.observe(blockRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, [segment.span.name, segment.events.length, segment.width]);

  const SpanText = useMemo(() => {
    const textContent = (
      <>
        {segment.span.name}{" "}
        <span className="text-white/70">{getDurationString(segment.span.startTime, segment.span.endTime)}</span>
      </>
    );

    const commonProps = {
      title: segment.span.name,
      ref: textRef,
      className: "text-xs font-medium text-white/90 truncate",
    };

    if (textPosition === "inside") {
      return (
        <span
          {...commonProps}
          className={cn(commonProps.className, "absolute text-left")}
          style={{
            left: segment.events.length > 0 ? `${TEXT_PADDING.WITH_EVENTS}px` : `${TEXT_PADDING.WITHOUT_EVENTS}px`,
          }}
        >
          {textContent}
        </span>
      );
    }

    if (segment.left > 50) {
      return (
        <span
          {...commonProps}
          className={cn(commonProps.className, "absolute text-right")}
          style={{
            right: `calc(100% - ${segment.left}% + 16px)`,
            maxWidth: "250px",
          }}
        >
          {textContent}
        </span>
      );
    }

    return (
      <span {...commonProps} className={cn(commonProps.className, "ml-1 text-left text-white/90")}>
        {textContent}
      </span>
    );
  }, [
    segment.span.name,
    segment.span.startTime,
    segment.span.endTime,
    segment.left,
    segment.events.length,
    textPosition,
  ]);

  return (
    <div
      key={virtualRow.index}
      data-index={virtualRow.index}
      onClick={() => setSelectedSpan(segment.span)}
      className={cn(
        "absolute top-0 left-0 w-full h-8 flex items-center px-4 hover:bg-muted cursor-pointer transition duration-200"
      )}
      style={{
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      {isSelected && <div className="h-full w-full absolute left-0 bg-primary/25" />}
      {segment.left > 50 && textPosition === "outside" && (
        <span
          title={segment.span.name}
          ref={textRef}
          className="text-xs font-medium text-black truncate absolute"
          style={{
            right: `calc(100% - ${segment.left}% + 16px)`,
            textAlign: "right",
            maxWidth: "250px",
          }}
        >
          {segment.span.name}{" "}
          <span className="text-secondary-foreground">
            {getDurationString(segment.span.startTime, segment.span.endTime)}
          </span>
        </span>
      )}
      <div
        ref={blockRef}
        className="rounded relative z-20 flex items-center"
        style={{
          backgroundColor:
            segment.span.status === "error" ? "rgba(204, 51, 51, 1)" : SPAN_TYPE_TO_COLOR[segment.span.spanType],
          marginLeft: segment.left + "%",
          width: `max(${segment.width}%, 2px)`,
          height: 24,
        }}
      >
        {segment.events.map((event) => (
          <div
            key={event.id}
            className="absolute bg-orange-400 w-1 rounded"
            style={{
              left: event.left + "%",
              top: 0,
              height: 24,
            }}
          />
        ))}
        {textPosition === "inside" && SpanText}
      </div>
      {textPosition === "outside" && SpanText}
    </div>
  );
};

export default memo(TimelineElement);
