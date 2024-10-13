import { getDurationString } from '@/lib/flow/utils';
import React, { useEffect, useRef, useState } from 'react';
import { Label } from '../ui/label';
import { Span, SpanType } from '@/lib/traces/types';
import { Activity, ArrowRight, Braces, Gauge, MessageCircleMore } from 'lucide-react';
import { SPAN_TYPE_TO_COLOR } from '@/lib/traces/utils';

const ROW_HEIGHT = 36;
const SQUARE_SIZE = 22;
const SQUARE_ICON_SIZE = 16;

interface SpanCardProps {
  span: Span
  parentY: number
  childSpans: { [key: string]: Span[] }
  containerWidth: number
  depth: number
  selectedSpan?: Span | null
  onSpanSelect?: (span: Span) => void
}

export function SpanCard({ span, childSpans, parentY, onSpanSelect, containerWidth, depth, selectedSpan }: SpanCardProps) {

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

    <div
      className='text-md flex w-full flex-col'
      ref={ref}
    >
      <div
        className='border-l-2 border-b-2 border-l-secondary border-b-secondary rounded-bl-lg absolute left-0'
        style={{
          height: segmentHeight - ROW_HEIGHT / 2 + (SQUARE_SIZE - SQUARE_ICON_SIZE) / 2,
          top: -segmentHeight + ROW_HEIGHT - (SQUARE_SIZE - SQUARE_ICON_SIZE) / 2,
          left: SQUARE_SIZE / 2 - 1,
          width: SQUARE_SIZE / 2,
        }}
      />
      <div
        className="flex w-full items-center space-x-2 cursor-pointer group relative"
        style={{
          height: ROW_HEIGHT,
        }}
      >
        <div
          className="flex items-center justify-center z-30 rounded"
          style={{
            backgroundColor: SPAN_TYPE_TO_COLOR[span.spanType],
            width: SQUARE_SIZE,
            height: SQUARE_SIZE,
          }}
        >
          {
            span.spanType === SpanType.DEFAULT && <Braces size={SQUARE_ICON_SIZE} />
          }
          {
            span.spanType === SpanType.LLM && <MessageCircleMore size={SQUARE_ICON_SIZE} />
          }
          {
            span.spanType === SpanType.EXECUTOR && <Activity size={SQUARE_ICON_SIZE} />
          }
          {
            span.spanType === SpanType.EVALUATOR && <ArrowRight size={SQUARE_ICON_SIZE} />
          }
          {
            span.spanType === SpanType.EVALUATION && <Gauge size={SQUARE_ICON_SIZE} />
          }
        </div>
        <div className='text-ellipsis overflow-hidden whitespace-nowrap text-base truncate max-w-[200px]'>{span.name}</div>
        <Label className='text-secondary-foreground'>{getDurationString(span.startTime, span.endTime)}</Label>
        {
          span.events.length > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
              <Label className='text-secondary-foreground'>{span.events.length}</Label>
            </div>
          )
        }
        <div className="z-30 top-[-px]  hover:bg-red-100/10 absolute transition-all"
          style={{
            width: containerWidth,
            height: ROW_HEIGHT,
            left: -depth * 24 - 16,
          }}
          onClick={() => {
            onSpanSelect?.(span);
          }}
        />
        {
          isSelected && (
            <div className="absolute top-0 w-full bg-blue-400/10 z-30 border-l-2 border-l-blue-400"
              style={{
                width: containerWidth,
                height: ROW_HEIGHT,
                left: -depth * 24 - 16,
              }}
            />
          )
        }
      </div>
      <div className="flex flex-col">
        {childrenSpans && childrenSpans.map((child, index) => (
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
