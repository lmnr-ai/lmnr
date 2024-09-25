import React, { useEffect, useRef, useState } from 'react'
import { SpanCard } from './span-card'
import { getDurationString } from '@/lib/flow/utils'
import { ScrollArea, ScrollBar } from '../ui/scroll-area'
import { Label } from '../ui/label'
import { Span, TraceWithSpans } from '@/lib/traces/types'
import { CircleDollarSign, Clock3, Coins } from 'lucide-react'
import { SpanView } from './span-view'
import Timeline from './timeline'
import { cn } from '@/lib/utils'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface SpanCardsProps {
  trace: TraceWithSpans
}


export default function SpanCards({ trace }: SpanCardsProps) {
  const spans = trace.spans

  const childSpans = {} as { [key: string]: Span[] }

  const topLevelSpans = spans.filter(span => !span.parentSpanId)

  for (const span of spans) {
    if (span.parentSpanId) {
      if (!childSpans[span.parentSpanId]) {
        childSpans[span.parentSpanId] = []
      }
      childSpans[span.parentSpanId].push(span)
    }
  }
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(searchParams.get('spanId') ? spans.find(span => span.spanId === searchParams.get('spanId')) || null : null);
  const router = useRouter();
  const pathName = usePathname();
  const ref = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const traceTreePanel = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  // here timelineWidth refers to the width of the trace tree panel and waterfall timeline
  const [timelineWidth, setTimelineWidth] = useState(0)

  useEffect(() => {
    if (!container.current) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerHeight(height);
        setContainerWidth(width)
      }
    });
    resizeObserver.observe(container.current);

    return () => {
      resizeObserver.disconnect();
    }

  }, [container.current])

  useEffect(() => {

    // if no span is selected, timeline should take full width
    if (!selectedSpan) {
      setTimelineWidth(containerWidth)
    } else {
      // if a span is selected, waterfall is hidden, so timeline should take the width of the trace tree panel
      setTimelineWidth(traceTreePanel.current!.getBoundingClientRect().width + 1)
    }

  }, [containerWidth, selectedSpan])

  return (
    <div className='flex h-full w-full' ref={container}>
      <div
        className='flex-none'
        style={{
          width: timelineWidth,
        }}
      >
        <div className='flex-grow flex'>
          <ScrollArea
            className='overflow-auto w-1 flex-grow'
            style={{
              width: timelineWidth,
              height: containerHeight
            }}
          >
            <table className='w-full h-full'>
              <tbody className='w-full'>
                <tr
                  className='flex'
                  style={{
                    minHeight: containerHeight
                  }}
                >
                  <td className={cn('p-0 border-r left-0 bg-background flex-none', !selectedSpan ? "sticky z-50" : "")}>
                    <div className='flex flex-col pb-4' ref={traceTreePanel}>
                      <div
                        className='flex items-center space-x-2 px-2 pt-1 h-12 flex-none sticky top-0 bg-background z-40 border-b'
                        ref={ref}
                      >
                        <div className='flex space-x-1 items-center p-0.5 px-2 border rounded-md'>
                          <Clock3 size={12} />
                          <Label className='text-secondary-foreground text-sm'>{getDurationString(trace.startTime, trace.endTime)}</Label>
                        </div>
                        <div className='flex space-x-1 items-center p-0.5 px-2 border rounded-md'>
                          <Coins size={12} />
                          <Label className='text-secondary-foreground text-sm'>{trace.totalTokenCount}</Label>
                        </div>
                        <div className='flex space-x-1 items-center p-0.5 px-2 border rounded-md'>
                          <CircleDollarSign size={12} />
                          <Label className='text-secondary-foreground text-sm'>${trace.cost?.toFixed(5)}</Label>
                        </div>
                      </div>
                      <div className='flex flex-col px-2 pt-1'>
                        {
                          topLevelSpans.map((span, index) => (
                            <div
                              key={index}
                              className='pl-6 relative'
                            >
                              <SpanCard
                                parentY={0}
                                span={span}
                                childSpans={childSpans}
                                depth={1}
                                selectedSpan={selectedSpan}
                                containerWidth={timelineWidth}
                                onSpanSelect={(span) => {
                                  setSelectedSpan(span)
                                  setTimelineWidth(traceTreePanel.current!.getBoundingClientRect().width + 1)
                                  searchParams.set('spanId', span.spanId)
                                  router.push(`${pathName}?${searchParams.toString()}`);
                                }}
                              />
                            </div>
                          ))

                        }
                      </div>
                    </div>
                  </td>
                  {!selectedSpan && (
                    <td className='flex flex-grow w-full p-0'>
                      <Timeline spans={spans} childSpans={childSpans} />
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
            <ScrollBar orientation='horizontal' />
          </ScrollArea>
        </div>
      </div>
      {selectedSpan && (
        <div className='flex-grow flex flex-col'>
          <SpanView key={selectedSpan.spanId} spanPreview={selectedSpan} onCloseClick={() => {
            setSelectedSpan(null)
            searchParams.delete('spanId')
            router.push(`${pathName}?${searchParams.toString()}`);
            setTimelineWidth(container.current!.getBoundingClientRect().width)
          }} />
        </div>
      )}
    </div >
  )
}
