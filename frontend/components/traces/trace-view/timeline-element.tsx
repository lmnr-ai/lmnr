import { VirtualItem } from "@tanstack/react-virtual";
import { CircleDollarSign, Coins } from "lucide-react";
import React, { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { TimelineData } from "@/components/traces/trace-view/trace-view-store-utils.ts";
import { getLLMMetrics, getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn, getDurationString } from "@/lib/utils";

const TEXT_PADDING = {
  WITH_EVENTS: 8,
  WITHOUT_EVENTS: 4,
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "standard",
});

const TimelineElement = ({
  setSelectedSpan,
  span,
  virtualRow,
  selectedSpan,
}: {
  span: TimelineData["spans"]["0"];
  virtualRow: VirtualItem;
  selectedSpan?: TraceViewSpan;
  setSelectedSpan: (span?: TraceViewSpan) => void;
}) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [textPosition, setTextPosition] = useState<"inside" | "outside">("inside");

  const isSelected = useMemo(() => selectedSpan?.spanId === span.span.spanId, [span.span.spanId, selectedSpan?.spanId]);

  const handleSpanSelect = () => {
    if (!span.span.pending) {
      setSelectedSpan(span.span);
    }
  };

  const llmMetrics = getLLMMetrics(span.span);

  useLayoutEffect(() => {
    if (!blockRef.current || !textRef.current) return;

    const measure = () => {
      if (textRef.current && blockRef.current) {
        const textWidth = textRef.current.offsetWidth;
        const blockWidth = blockRef.current.offsetWidth + 8;
        const availableWidth = blockWidth - (span.events.length > 0 ? 16 : 8) - 4;
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
  }, [span.span.name, span.span.model, span.span.spanType, span.events.length, span.width]);

  const spanTextElement = useMemo(() => {
    const textContent = (
      <div className={"flex items-center gap-1.5"}>
        <div className={"overflow-hidden text-ellipsis whitespace-nowrap text-nowrap"}>
          {getSpanDisplayName(span.span)}
        </div>
        <span className="text-white/70">{getDurationString(span.span.startTime, span.span.endTime)}</span>
        {llmMetrics && (
          <>
            <span className={"text-white/70 inline-flex items-center gap-1"}>
              <Coins className="min-w-1" size={12} />
              {numberFormatter.format(llmMetrics.tokens)}
            </span>

            <span className={"text-white/70 flex w-fit items-center gap-1"}>
              <CircleDollarSign className="min-w-1" size={12} />
              {llmMetrics.cost.toFixed(3)}
            </span>
          </>
        )}
      </div>
    );

    const commonProps = {
      title: span.span.name,
      ref: textRef,
      className: "text-xs font-medium text-white/90",
    };

    if (textPosition === "inside") {
      return (
        <span
          {...commonProps}
          className={cn(commonProps.className, "absolute text-left")}
          style={{
            left: span.events.length > 0 ? `${TEXT_PADDING.WITH_EVENTS}px` : `${TEXT_PADDING.WITHOUT_EVENTS}px`,
          }}
        >
          {textContent}
        </span>
      );
    }

    if (span.left > 50) {
      return (
        <span
          {...commonProps}
          className={cn(commonProps.className, "absolute text-right")}
          style={{
            right: `calc(100% - ${span.left}% + 20px)`,
            maxWidth: `calc(${span.left}% - 16px)`,
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
  }, [span.span, span.left, span.events.length, llmMetrics, textPosition]);

  return (
    <div
      key={virtualRow.index}
      data-index={virtualRow.index}
      onClick={handleSpanSelect}
      className={cn("absolute w-full h-8 flex items-center px-4 hover:bg-muted cursor-pointer transition duration-200")}
      style={{
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      {isSelected && <div className="h-full w-full absolute left-0 bg-primary/25" />}
      <div
        ref={blockRef}
        className="rounded relative z-20 flex items-center"
        style={{
          backgroundColor:
            span.span.status === "error" ? "rgba(204, 51, 51, 1)" : SPAN_TYPE_TO_COLOR[span.span.spanType],
          marginLeft: span.left + "%",
          width: `max(${span.width}%, 2px)`,
          height: 24,
        }}
      >
        {span.events.map((event) => (
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
        {textPosition === "inside" && spanTextElement}
      </div>
      {textPosition === "outside" && spanTextElement}
    </div>
  );
};

export default memo(TimelineElement);
