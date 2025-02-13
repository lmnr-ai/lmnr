import { ChevronDown, ChevronRight } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { getDuration, getDurationString } from '@/lib/flow/utils';
import { SpanPreview } from '@/lib/traces/types';
import { cn, formatSecondsToMinutesAndSeconds } from '@/lib/utils';

import SpanTypeIcon from './span-type-icon';

const ROW_HEIGHT = 36;
const SQUARE_SIZE = 22;
const SQUARE_ICON_SIZE = 16;

interface SpanCardProps {
  span: SpanPreview;
  activeSpans: string[];
  parentY: number;
  childSpans: { [key: string]: SpanPreview[] };
  containerWidth: number;
  depth: number;
  selectedSpan?: SpanPreview | null;
  collapsedSpans: Set<string>;
  traceStartTime: string;
  onSpanSelect?: (span: SpanPreview) => void;
  onToggleCollapse?: (spanId: string) => void;
  onSelectTime?: (time: number) => void;
}

export function SpanCard({
  span,
  childSpans,
  parentY,
  onSpanSelect,
  containerWidth,
  depth,
  selectedSpan,
  collapsedSpans,
  onToggleCollapse,
  traceStartTime,
  activeSpans,
  onSelectTime
}: SpanCardProps) {
  const [isSelected, setIsSelected] = useState(false);
  const [segmentHeight, setSegmentHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const childrenSpans = childSpans[span.spanId];

  const hasChildren = childrenSpans && childrenSpans.length > 0;

  useEffect(() => {
    if (ref.current) {
      setSegmentHeight(Math.max(0, ref.current.getBoundingClientRect().y - parentY));
    }
  }, [parentY, collapsedSpans]);

  useEffect(() => {
    setIsSelected(selectedSpan?.spanId === span.spanId);
  }, [selectedSpan]);

  return (
    <div className="text-md flex w-full flex-col" ref={ref}>
      <div
        className="border-l-2 border-b-2 rounded-bl-lg absolute left-0"
        style={{
          height:
            segmentHeight -
            ROW_HEIGHT / 2 +
            (SQUARE_SIZE - SQUARE_ICON_SIZE) / 2,
          top:
            -segmentHeight + ROW_HEIGHT - (SQUARE_SIZE - SQUARE_ICON_SIZE) / 2,
          left: SQUARE_SIZE / 2 - 1,
          width: SQUARE_SIZE / 2
        }}
      />
      <div className="flex flex-col">
        <div
          className="flex w-full items-center space-x-2 cursor-pointer group relative"
          style={{
            height: ROW_HEIGHT
          }}
        >
          <SpanTypeIcon
            spanType={span.spanType}
            containerWidth={SQUARE_SIZE}
            containerHeight={SQUARE_SIZE}
            size={SQUARE_ICON_SIZE}
          />
          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate max-w-[150px]">
            {span.name}
          </div>
          <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
            {getDurationString(span.startTime, span.endTime)}
          </div>
          <div
            className="z-30 top-[-px]  hover:bg-red-100/10 absolute transition-all"
            style={{
              width: containerWidth,
              height: ROW_HEIGHT,
              left: -depth * 24 - 8
            }}
            onClick={() => {
              onSpanSelect?.(span);
            }}
          />
          {isSelected && (
            <div
              className="absolute top-0 w-full bg-primary/25 border-l-2 border-l-primary"
              style={{
                width: containerWidth,
                height: ROW_HEIGHT,
                left: -depth * 24 - 8
              }}
            />
          )}
          {hasChildren && (
            <button
              className="z-30 p-1 hover:bg-muted transition-all text-muted-foreground rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.(span.spanId);
              }}
            >
              {collapsedSpans.has(span.spanId) ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
          <div className="flex-grow" />
          <div
            className="flex items-center z-40"
            style={{
              height: ROW_HEIGHT
            }}
            onClick={() => {
              onSelectTime?.(getDuration(traceStartTime, span.startTime) / 1000);
            }}
          >
            <div
              className={cn(
                'flex items-center text-xs font-mono text-muted-foreground p-1 cursor-pointer rounded-l-full px-2',
                activeSpans.includes(span.spanId) ? 'bg-primary/80 text-white' : 'hover:bg-muted'
              )}
            >
              {formatSecondsToMinutesAndSeconds(getDuration(traceStartTime, span.startTime) / 1000)}
            </div>
          </div>
        </div>
      </div>
      {!collapsedSpans.has(span.spanId) && (
        <div className="flex flex-col">
          {childrenSpans &&
            childrenSpans.map((child, index) => (
              <div className="pl-6 relative" key={index}>
                <SpanCard
                  activeSpans={activeSpans}
                  traceStartTime={traceStartTime}
                  span={child}
                  childSpans={childSpans}
                  parentY={ref.current?.getBoundingClientRect().y || 0}
                  onSpanSelect={onSpanSelect}
                  containerWidth={containerWidth}
                  selectedSpan={selectedSpan}
                  collapsedSpans={collapsedSpans}
                  onToggleCollapse={onToggleCollapse}
                  onSelectTime={onSelectTime}
                  depth={depth + 1}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
