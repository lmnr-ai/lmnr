import { ChevronsRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import { useProjectContext } from '@/contexts/project-context';
import { Span } from '@/lib/traces/types';
import { cn, swrFetcher } from '@/lib/utils';

import { Button } from '../ui/button';
import MonoWithCopy from '../ui/mono-with-copy';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import { SpanCard } from './span-card';
import { SpanView } from './span-view';
import StatsShields from './stats-shields';
import Timeline from './timeline';

interface TraceViewProps {
  traceId: string;
  onClose: () => void;
}

export default function TraceView({ traceId, onClose }: TraceViewProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const router = useRouter();
  const pathName = usePathname();
  const container = useRef<HTMLDivElement>(null);
  const traceTreePanel = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  // here timelineWidth refers to the width of the trace tree panel and waterfall timeline
  const [timelineWidth, setTimelineWidth] = useState(0);
  const { projectId } = useProjectContext();

  const { data: trace, isLoading } = useSWR(
    `/api/projects/${projectId}/traces/${traceId}`,
    swrFetcher
  );

  const [childSpans, setChildSpans] = useState<{ [key: string]: Span[] }>({});
  const [topLevelSpans, setTopLevelSpans] = useState<Span[]>([]);
  const [spans, setSpans] = useState<Span[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(
    searchParams.get('spanId')
      ? spans.find(
        (span: Span) => span.spanId === searchParams.get('spanId')
      ) || null
      : null
  );

  useEffect(() => {
    if (!trace) {
      return;
    }

    const spans = trace.spans;

    const childSpans = {} as { [key: string]: Span[] };

    const topLevelSpans = spans.filter((span: Span) => !span.parentSpanId);

    for (const span of spans) {
      if (span.parentSpanId) {
        if (!childSpans[span.parentSpanId]) {
          childSpans[span.parentSpanId] = [];
        }
        childSpans[span.parentSpanId].push(span);
      }
    }

    setChildSpans(childSpans);
    setTopLevelSpans(topLevelSpans);
    setSpans(spans);

    // If there's only one span, select it automatically
    if (spans.length === 1) {
      const singleSpan = spans[0];
      setSelectedSpan(singleSpan);
      searchParams.set('spanId', singleSpan.spanId);
      router.push(`${pathName}?${searchParams.toString()}`);
    } else {
      // Otherwise, use the spanId from URL if present
      setSelectedSpan(
        searchParams.get('spanId')
          ? spans.find(
            (span: Span) => span.spanId === searchParams.get('spanId')
          ) || null
          : null
      );
    }
  }, [trace]);

  useEffect(() => {
    setSelectedSpan(
      searchParams.get('spanId')
        ? spans.find(
          (span: Span) => span.spanId === searchParams.get('spanId')
        ) || null
        : null
    );
  }, [searchParams.get('spanId')]);

  useEffect(() => {
    if (!container.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerHeight(height);
        setContainerWidth(width);
      }
    });
    resizeObserver.observe(container.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [container.current]);

  useEffect(() => {
    if (!traceTreePanel.current) {
      return;
    }

    // if no span is selected, timeline should take full width
    if (!selectedSpan) {
      setTimelineWidth(containerWidth);
    } else {
      // if a span is selected, waterfall is hidden, so timeline should take the width of the trace tree panel
      setTimelineWidth(
        traceTreePanel.current!.getBoundingClientRect().width + 1
      );
    }
  }, [containerWidth, selectedSpan, traceTreePanel.current]);

  return (
    <div className="flex flex-col h-full w-full overflow-clip">
      <div className="h-12 flex flex-none items-center border-b space-x-2 px-4">
        <Button
          variant={'ghost'}
          className="px-1"
          onClick={() => {
            searchParams.delete('spanId');
            router.push(`${pathName}?${searchParams.toString()}`);
            onClose();
          }}
        >
          <ChevronsRight />
        </Button>
        <div>Trace</div>
        <MonoWithCopy className="text-secondary-foreground">{traceId}</MonoWithCopy>
        <div className="flex-grow" />
        <div>
          {selectedSpan && (
            <Button
              variant={'outline'}
              onClick={() => {
                setSelectedSpan(null);
                searchParams.delete('spanId');
                router.push(`${pathName}?${searchParams.toString()}`);
                setTimelineWidth(
                  container.current!.getBoundingClientRect().width
                );
              }}
            >
              Show timeline
            </Button>
          )}
        </div>
      </div>
      <div className="flex-grow flex">
        {isLoading && (
          <div className="w-full p-4 h-full flex flex-col space-y-2">
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
          </div>
        )}
        {trace && (
          <div className="flex h-full w-full" ref={container}>
            <div
              className="flex-none"
              style={{
                width: timelineWidth
              }}
            >
              <div className="flex-grow flex">
                <ScrollArea
                  className="overflow-auto w-1 flex-grow"
                  style={{
                    width: timelineWidth,
                    height: containerHeight
                  }}
                >
                  <table className="w-full h-full">
                    <tbody className="w-full">
                      <tr
                        className="flex"
                        style={{
                          minHeight: containerHeight
                        }}
                      >
                        <td
                          className={cn(
                            'p-0 border-r left-0 bg-background flex-none',
                            !selectedSpan ? 'sticky z-50' : ''
                          )}
                        >
                          <div
                            className="flex flex-col pb-4"
                            ref={traceTreePanel}
                          >
                            <StatsShields
                              className="px-2 pt-1 h-12 flex-none sticky top-0 bg-background z-40 border-b"
                              startTime={trace.startTime}
                              endTime={trace.endTime}
                              totalTokenCount={trace.totalTokenCount}
                              inputTokenCount={trace.inputTokenCount}
                              outputTokenCount={trace.outputTokenCount}
                              inputCost={trace.inputCost}
                              outputCost={trace.outputCost}
                              cost={trace.cost}
                            />
                            <div className="flex flex-col px-2 pt-1">
                              {topLevelSpans.map((span, index) => (
                                <div key={index} className="pl-6 relative">
                                  <SpanCard
                                    parentY={0}
                                    span={span}
                                    childSpans={childSpans}
                                    depth={1}
                                    selectedSpan={selectedSpan}
                                    containerWidth={timelineWidth}
                                    onSpanSelect={(span) => {
                                      setSelectedSpan(span);
                                      setTimelineWidth(
                                        traceTreePanel.current!.getBoundingClientRect()
                                          .width + 1
                                      );
                                      searchParams.set('spanId', span.spanId);
                                      router.push(
                                        `${pathName}?${searchParams.toString()}`
                                      );
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                        {!selectedSpan && !searchParams.get('spanId') && (
                          <td className="flex flex-grow w-full p-0">
                            <Timeline spans={spans} childSpans={childSpans} />
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            </div>
            {selectedSpan && (
              <div className="flex-grow flex flex-col">
                <SpanView
                  key={selectedSpan.spanId}
                  spanId={selectedSpan.spanId}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
