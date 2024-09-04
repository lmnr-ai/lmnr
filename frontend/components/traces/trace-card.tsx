import { getDurationString } from "@/lib/flow/utils"
import React, { useEffect, useRef, useState } from "react"
import { Label } from "../ui/label"
import { Span } from "@/lib/traces/types"


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

  const [isSelected, setIsSelected] = useState(false)
  const [height, setHeight] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const childrenSpans = childSpans[span.spanId]

  useEffect(() => {
    if (ref.current) {
      setHeight(ref.current.getBoundingClientRect().y - parentY)
    }
  }, [parentY])

  useEffect(() => {
    setIsSelected(selectedSpan?.spanId === span.spanId)
  }, [selectedSpan])

  return (

    <div
      className='text-md flex w-full flex-col'
      ref={ref}
    >
      <div
        className='border-l-2 border-b-2 border-l-secondary border-b-secondary rounded-bl-lg absolute w-4 left-0'
        style={{
          height: height - 2,
          top: -height + 18,
          left: 8
        }}
      />
      <div className="flex w-full items-center space-x-2 h-[28px] cursor-pointer group relative">
        <div className="w-4 h-4 bg-secondary rounded"></div>
        <div className='text-ellipsis overflow-hidden whitespace-nowrap text-sm max-w-full'>{span.name}</div>
        <Label className='text-secondary-foreground'>{getDurationString(span.startTime, span.endTime)}</Label>
        {
          span.events.length > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
              <Label className='text-secondary-foreground'>{span.events.length}</Label>
            </div>
          )
        }
        <div className="z-50 top-[-px] h-[28px] hover:bg-red-100/10 absolute transition-all"
          style={{
            width: containerWidth,
            left: -depth * 24 - 16,
          }}
          onClick={() => {
            onSpanSelect?.(span)
          }}
        />
        {
          isSelected && (
            <div className='absolute top-0 w-full bg-blue-400/10 z-40 h-[28px] border-l-2 border-l-blue-400'
              style={{
                width: containerWidth,
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
  )
}
