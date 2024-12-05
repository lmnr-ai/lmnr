import React, { useEffect, useRef, useState } from 'react';

import { getDurationString } from '@/lib/flow/utils';
import { Span } from '@/lib/traces/types';

import { Label } from '../ui/label';
import SpanTypeIcon from './span-type-icon';

const ROW_HEIGHT = 36;
const SQUARE_SIZE = 22;
const SQUARE_ICON_SIZE = 16;

interface SpanCardProps {
  span: Span;
  parentY: number;
  childSpans: { [key: string]: Span[] };
  containerWidth: number;
  depth: number;
  selectedSpan?: Span | null;
  onSpanSelect?: (span: Span) => void;
}

export function SpanCard({
  span,
  childSpans,
  parentY,
  onSpanSelect,
  containerWidth,
  depth,
  selectedSpan
}: SpanCardProps) {
  const [isSelected, setIsSelected] = useState(false);
  const [segmentHeight, setSegmentHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const childrenSpans = childSpans[span.spanId];

  useEffect(() => {
    if (ref.current) {
      setSegmentHeight(ref.current.getBoundingClientRect().y - parentY);
    }
  }, [parentY]);

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
          <div className="text-ellipsis overflow-hidden whitespace-nowrap text-base truncate max-w-[200px]">
            {span.name}
          </div>
          <Label className="text-secondary-foreground">
            {getDurationString(span.startTime, span.endTime)}
          </Label>
          <div
            className="z-30 top-[-px]  hover:bg-red-100/10 absolute transition-all"
            style={{
              width: containerWidth,
              height: ROW_HEIGHT,
              left: -depth * 24 - 16
            }}
            onClick={() => {
              onSpanSelect?.(span);
            }}
          />
          {isSelected && (
            <div
              className="absolute top-0 w-full bg-primary/20 border-l-2 border-l-primary"
              style={{
                width: containerWidth,
                height: ROW_HEIGHT,
                left: -depth * 24 - 16
              }}
            />
          )}
        </div>
      </div>
      <div className="flex flex-col">
        {childrenSpans &&
          childrenSpans.map((child, index) => (
            <div className="pl-6 relative" key={index}>
              <SpanCard
                span={child}
                childSpans={childSpans}
                parentY={ref.current?.getBoundingClientRect().y || 0}
                onSpanSelect={onSpanSelect}
                containerWidth={containerWidth}
                selectedSpan={selectedSpan}
                depth={depth + 1}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
