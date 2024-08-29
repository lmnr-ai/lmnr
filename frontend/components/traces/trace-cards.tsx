import React, { useEffect, useRef, useState } from 'react'
import { GraphMessagePreview } from '@/lib/pipeline/types'
import { SpanCard } from './trace-card'
import { getDurationString } from '@/lib/flow/utils'
import { ScrollArea, ScrollBar } from '../ui/scroll-area'
import { Label } from '../ui/label'
import { SpanPreview, TraceWithSpanPreviews } from '@/lib/traces/types'
import StatusLabel from '../ui/status-label'
import { CircleDollarSign, Clock3, Coins } from 'lucide-react'
import { SpanView } from './span-view'
import { TraceOverviewMessage } from '../pipeline/trace-overview-message'
import Timeline from './timeline'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/table'
import { cn } from '@/lib/utils'

interface TraceCardsProps {
  trace: TraceWithSpanPreviews
  enableFeedback?: boolean
  onTraceHover?: (nodeId?: string) => void
}


export default function TraceCards({ trace, enableFeedback, onTraceHover }: TraceCardsProps) {
  const spans = trace.spans

  const childSpans = {} as { [key: string]: SpanPreview[] }

  const topLevelSpans = spans.filter(span => !span.parentSpanId)

  for (const span of spans) {
    if (span.parentSpanId) {
      if (!childSpans[span.parentSpanId]) {
        childSpans[span.parentSpanId] = []
      }
      childSpans[span.parentSpanId].push(span)
    }
  }

  const [selectedSpan, setSelectedSpan] = useState<SpanPreview | null>(null)


  const ref = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const traceTreePanel = useRef<HTMLDivElement>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [timelineWidth, setTimelineWidth] = useState(0)

  useEffect(() => {

    if (!container.current) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerWidth(width);
        setContainerHeight(height);

        if (selectedSpan === null) {
          setTimelineWidth(width)
        }
      }
    });

    resizeObserver.observe(container.current);

    return () => {
      resizeObserver.disconnect();
    }

  }, [container.current, selectedSpan])

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
                        <StatusLabel success={trace.success} />
                        <div className='flex space-x-1 items-center'>
                          <Clock3 size={12} />
                          <Label className='text-secondary-foreground text-sm'>{getDurationString(trace.startTime, trace.endTime)}</Label>
                        </div>
                        <div className='flex space-x-1 items-center'>
                          <Coins size={12} />
                          <Label className='text-secondary-foreground text-sm'>{trace.totalTokenCount}</Label>
                        </div>
                        <div className='flex space-x-1 items-center'>
                          <CircleDollarSign size={12} />
                          <Label className='text-secondary-foreground text-sm'>{trace.cost?.toFixed(5)}$</Label>
                        </div>
                      </div>
                      <div className='flex flex-col px-2'>
                        {
                          topLevelSpans.map((span, index) => (
                            <div
                              key={index}
                              className='pl-6 relative mt-1'
                            >

                              <SpanCard
                                parentY={0}
                                span={span}
                                childSpans={childSpans}
                                depth={1}
                                selectedSpan={selectedSpan}
                                containerWidth={timelineWidth}
                                onSpanSelect={(span) => {
                                  setTimelineWidth(traceTreePanel.current!.getBoundingClientRect().width + 1)
                                  setSelectedSpan(span)
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
          <SpanView spanPreview={selectedSpan} onCloseClick={() => {
            setSelectedSpan(null)
            setTimelineWidth(containerWidth)
          }} />
        </div>
      )}
    </div >
  )
}
