import { ChartNoAxesGantt, ChevronsRight, Disc } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

import { useProjectContext } from '@/contexts/project-context';
import { useUserContext } from '@/contexts/user-context';
import { Span, SpanType, Trace } from '@/lib/traces/types';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import MonoWithCopy from '../ui/mono-with-copy';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import SessionPlayer, { SessionPlayerHandle } from './session-player';
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
  const { projectId } = useProjectContext();

  const container = useRef<HTMLDivElement>(null);
  // containerHeight refers to the height of the trace view container
  const [containerHeight, setContainerHeight] = useState(0);
  // containerWidth refers to the width of the trace view container
  const [containerWidth, setContainerWidth] = useState(0);
  const traceTreePanel = useRef<HTMLDivElement>(null);
  // here timelineWidth refers to the width of the trace tree panel AND waterfall timeline
  const [timelineWidth, setTimelineWidth] = useState(0);
  const [showBrowserSession, setShowBrowserSession] = useState(false);
  const browserSessionRef = useRef<SessionPlayerHandle>(null);

  const [trace, setTrace] = useState<Trace | null>(null);

  const [spans, setSpans] = useState<Span[]>([]);
  const spansRef = useRef<Span[]>([]);

  // Keep ref updated
  useEffect(() => {
    spansRef.current = spans;
  }, [spans]);

  const [childSpans, setChildSpans] = useState<{ [key: string]: Span[] }>({});
  const [topLevelSpans, setTopLevelSpans] = useState<Span[]>([]);

  const [selectedSpan, setSelectedSpan] = useState<Span | null>(
    searchParams.get('spanId')
      ? spans.find(
        (span: Span) => span.spanId === searchParams.get('spanId')
      ) || null
      : null
  );

  const [activeSpans, setActiveSpans] = useState<string[]>([]);

  // Add new state for collapsed spans
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [browserSessionTime, setBrowserSessionTime] = useState<number | null>(null);

  useEffect(() => {
    const fetchTrace = async () => {
      const trace = await fetch(`/api/projects/${projectId}/traces/${traceId}`);
      return await trace.json();
    };

    fetchTrace().then((trace) => {
      setTrace(trace);
      if (trace.hasBrowserSession) {
        setShowBrowserSession(true);
      }
    });
  }, [traceId]);

  useEffect(() => {
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

    // Sort child spans for each parent by start time
    for (const parentId in childSpans) {
      childSpans[parentId].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }

    setChildSpans(childSpans);
    setTopLevelSpans(topLevelSpans);
  }, [spans]);

  useEffect(() => {
    const fetchSpans = async () => {
      const response = await fetch(`/api/projects/${projectId}/traces/${traceId}/spans`);
      const results = await response.json();
      return enrichSpansWithPending(results);
    };

    fetchSpans().then((spans) => {
      setSpans(spans);

      // If there's only one span, select it automatically
      if (spans.length === 1) {
        const singleSpan = spans[0];
        setSelectedSpan(singleSpan);
        searchParams.set('spanId', singleSpan.spanId);
        searchParams.set('traceId', traceId);
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
    });
    return () => {
      setTrace(null);
      setSpans([]);
      setShowBrowserSession(false);
    };
  }, [traceId, projectId]);

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
    const newTraceTreePanelWidth = traceTreePanel.current.getBoundingClientRect().width;

    // if no span is selected, timeline should take full width
    if (!selectedSpan) {
      setTimelineWidth(containerWidth);
    } else {
      // if a span is selected, waterfall is hidden, so timeline should take the width of the trace tree panel
      setTimelineWidth(
        newTraceTreePanelWidth + 1
      );
    }
  }, [containerWidth, selectedSpan, traceTreePanel.current, collapsedSpans]);

  const dbSpanRowToSpan = (row: Record<string, any>): Span => ({
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    traceId: row.trace_id,
    spanType: row.span_type,
    name: row.name,
    path: row.attributes['lmnr.span.path'] ?? "",
    startTime: row.start_time,
    endTime: row.end_time,
    attributes: row.attributes,
    input: null,
    output: null,
    inputPreview: row.input_preview,
    outputPreview: row.output_preview,
    events: [],
    inputUrl: row.input_url,
    outputUrl: row.output_url,
    model: row.attributes['gen_ai.response.model'] ?? row.attributes['gen_ai.request.model'] ?? null,
  });

  const { supabaseClient: supabase } = useUserContext();

  useEffect(() => {
    if (!supabase || !traceId) {
      return;
    }

    const channel = supabase
      .channel(`trace-updates-${traceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'spans',
          filter: `trace_id=eq.${traceId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const rtEventSpan = dbSpanRowToSpan(payload.new);

            if (rtEventSpan.attributes['lmnr.internal.has_browser_session']) {
              setShowBrowserSession(true);
            }

            setTrace((currentTrace: Trace | null) => {
              if (!currentTrace) {
                return null;
              }

              const newTrace = { ...currentTrace };
              newTrace.endTime = new Date(Math.max(new Date(newTrace.endTime).getTime(), new Date(rtEventSpan.endTime).getTime())).toUTCString();
              newTrace.totalTokenCount += (rtEventSpan.attributes['gen_ai.usage.input_tokens'] ?? 0) + (rtEventSpan.attributes['gen_ai.usage.output_tokens'] ?? 0);
              newTrace.inputTokenCount += rtEventSpan.attributes['gen_ai.usage.input_tokens'] ?? 0;
              newTrace.outputTokenCount += rtEventSpan.attributes['gen_ai.usage.output_tokens'] ?? 0;
              newTrace.inputCost += rtEventSpan.attributes['gen_ai.usage.input_cost'] ?? 0;
              newTrace.outputCost += rtEventSpan.attributes['gen_ai.usage.output_cost'] ?? 0;
              newTrace.cost += (rtEventSpan.attributes['gen_ai.usage.input_cost'] ?? 0) + (rtEventSpan.attributes['gen_ai.usage.output_cost'] ?? 0);
              newTrace.hasBrowserSession = currentTrace.hasBrowserSession || rtEventSpan.attributes['lmnr.internal.has_browser_session'];

              return newTrace;
            });

            setSpans(currentSpans => {
              const newSpans = [...currentSpans];
              const index = newSpans.findIndex(span => span.spanId === rtEventSpan.spanId);
              if (index !== -1 && newSpans[index].pending) {
                newSpans[index] = rtEventSpan;
              } else {
                newSpans.push(rtEventSpan);
              }

              return enrichSpansWithPending(newSpans);
            });
          }
        }
      )
      .subscribe();

    // Remove only this specific channel on cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, traceId]);

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
        <div className="flex items-center space-x-2">
          <div>Trace</div>
          <MonoWithCopy className="text-secondary-foreground mt-0.5">{traceId}</MonoWithCopy>
        </div>
        <div className="flex-grow" />
        <div className="flex items-center space-x-2">
          {selectedSpan && (
            <Button
              variant={'secondary'}
              onClick={() => {
                setSelectedSpan(null);
                setTimeout(() => {
                  searchParams.delete('spanId');
                  router.push(`${pathName}?${searchParams.toString()}`);
                }, 10);
              }}
            >
              <ChartNoAxesGantt size={16} className="mr-2" />
              Show timeline
            </Button>
          )}
          {trace?.hasBrowserSession && (
            <Button
              variant={'secondary'}
              onClick={() => {
                setShowBrowserSession((s) => !s);
              }}
            >
              <Disc size={16} className="mr-2" />
              {showBrowserSession ? 'Hide browser session' : 'Show browser session'}
            </Button>
          )}
        </div>
      </div>
      <div className="flex-grow flex">
        {(!trace || spans.length === 0) && (
          <div className="w-full p-4 h-full flex flex-col space-y-2">
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
          </div>
        )}
        {trace && spans.length > 0 && (
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel>
              <div className="flex h-full w-full relative" ref={container}>
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
                                  className="px-2 h-10 sticky top-0 bg-background z-50 border-b"
                                  startTime={trace.startTime}
                                  endTime={trace.endTime}
                                  totalTokenCount={trace.totalTokenCount}
                                  inputTokenCount={trace.inputTokenCount}
                                  outputTokenCount={trace.outputTokenCount}
                                  inputCost={trace.inputCost}
                                  outputCost={trace.outputCost}
                                  cost={trace.cost}
                                />
                                <div className="flex flex-col pt-1">
                                  {topLevelSpans.map((span, index) => (
                                    <div key={index} className="pl-6 relative">
                                      <SpanCard
                                        activeSpans={activeSpans}
                                        traceStartTime={trace.startTime}
                                        parentY={traceTreePanel.current?.getBoundingClientRect().y || 0}
                                        span={span}
                                        childSpans={childSpans}
                                        depth={1}
                                        selectedSpan={selectedSpan}
                                        containerWidth={timelineWidth}
                                        collapsedSpans={collapsedSpans}
                                        onToggleCollapse={(spanId) => {
                                          setCollapsedSpans((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(spanId)) {
                                              next.delete(spanId);
                                            } else {
                                              next.add(spanId);
                                            }
                                            return next;
                                          });
                                        }}
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
                                        onSelectTime={(time) => {
                                          browserSessionRef.current?.goto(time);
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                            {!selectedSpan && (
                              <td className="flex flex-grow w-full p-0 relative">
                                <Timeline
                                  containerHeight={containerHeight}
                                  spans={spans}
                                  childSpans={childSpans}
                                  collapsedSpans={collapsedSpans}
                                  browserSessionTime={browserSessionTime}
                                />
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
                  <div
                    style={{ width: containerWidth - timelineWidth }}
                  >
                    <SpanView
                      key={selectedSpan.spanId}
                      spanId={selectedSpan.spanId}
                    />
                  </div>
                )}
              </div>
            </ResizablePanel>
            {showBrowserSession && (
              <ResizableHandle
                withHandle
              />
            )}
            <ResizablePanel
              style={{
                display: showBrowserSession ? 'block' : 'none'
              }}
            >
              <SessionPlayer
                ref={browserSessionRef}
                hasBrowserSession={trace.hasBrowserSession}
                traceId={traceId}
                onTimelineChange={(time) => {
                  setBrowserSessionTime(time);

                  const activeSpans = spans.filter(
                    (span: Span) => {
                      const spanStartTime = new Date(span.startTime).getTime();
                      const spanEndTime = new Date(span.endTime).getTime();

                      return spanStartTime <= time && spanEndTime >= time && span.parentSpanId !== null;
                    }
                  );

                  setActiveSpans(activeSpans.map((span) => span.spanId));
                }}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div >
  );
}

const enrichSpansWithPending = (existingSpans: Span[]): Span[] => {
  const existingSpanIds = new Set(existingSpans.map((span) => span.spanId));
  const pendingSpans = new Map<string, Span>();

  // First, add all existing pending spans to the pendingSpans map
  for (const span of existingSpans) {
    if (span.pending) {
      pendingSpans.set(span.spanId, span);
    }
  }

  for (const span of existingSpans) {
    if (span.parentSpanId) {
      const parentSpanIds = span.attributes['lmnr.span.ids_path'] as string[] | undefined;
      const parentSpanNames = span.attributes['lmnr.span.path'] as string[] | undefined;

      if (
        parentSpanIds === undefined || parentSpanNames === undefined ||
        parentSpanIds.length === 0 || parentSpanNames.length === 0 ||
        parentSpanIds.length !== parentSpanNames.length
      ) {
        continue;
      }

      const startTime = new Date(span.startTime);
      const endTime = new Date(span.endTime);
      for (let i = 0; i < parentSpanIds.length; i++) {
        const spanId = parentSpanIds[i];
        const spanName = parentSpanNames[i];

        // Skip if this span exists and is not pending
        if (existingSpanIds.has(spanId) && !pendingSpans.has(spanId)) {
          continue;
        }

        if (pendingSpans.has(spanId)) {
          // Update the time range of the pending span to cover all its children
          const existingStartTime = new Date(pendingSpans.get(spanId)!.startTime);
          const existingEndTime = new Date(pendingSpans.get(spanId)!.endTime);
          pendingSpans.set(
            spanId,
            {
              ...pendingSpans.get(spanId)!,
              startTime: (startTime < existingStartTime ? startTime : existingStartTime).toISOString(),
              endTime: (endTime > existingEndTime ? endTime : existingEndTime).toISOString(),
            }
          );
          continue;
        }

        const parentSpanId = i > 0 ? parentSpanIds[i - 1] : null;
        const parentSpanName = i > 0 ? parentSpanNames[i - 1] : null;
        const pendingSpan = {
          spanId,
          name: spanName,
          parentSpanId,
          parentSpanName,
          startTime: new Date(span.startTime).toISOString(),
          endTime: new Date(span.endTime).toISOString(),
          attributes: {},
          events: [],
          logs: [],
          spans: [],
          traceId: span.traceId,
          traceName: span.name,
          input: null,
          output: null,
          inputPreview: null,
          outputPreview: null,
          spanType: SpanType.DEFAULT,
          path: '',
          inputUrl: null,
          outputUrl: null,
          pending: true,
        } as Span;
        pendingSpans.set(spanId, pendingSpan);
      }
    }
  }

  // Filter out existing spans that are pending (to avoid duplicates)
  const nonPendingExistingSpans = existingSpans.filter(span => !span.pending);

  return [
    ...nonPendingExistingSpans,
    ...pendingSpans.values()
  ];
};
