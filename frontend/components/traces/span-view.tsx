import {
  Activity,
  ArrowRight,
  Braces,
  Gauge,
  MessageCircleMore,
} from 'lucide-react';
import useSWR from 'swr';

import { useProjectContext } from '@/contexts/project-context';
import { Event } from '@/lib/events/types';
import { Span, SpanType } from '@/lib/traces/types';
import { swrFetcher } from '@/lib/utils';

import Formatter from '../ui/formatter';
import { Skeleton } from '../ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { AddLabelPopover } from './add-label-popover';
import AddToLabelingQueuePopover from './add-to-labeling-queue-popover';
import ExportSpansDialog from './export-spans-dialog';
import { SpanViewSpan } from './span-view-span';
import StatsShields from './stats-shields';
import MonoWithCopy from '../ui/mono-with-copy';

interface SpanViewProps {
  spanId: string;
}

export function SpanView({ spanId }: SpanViewProps) {
  const { projectId } = useProjectContext();
  const { data: span } = useSWR<Span>(
    `/api/projects/${projectId}/spans/${spanId}`,
    swrFetcher
  );
  const { data: events } = useSWR<Event[]>(
    `/api/projects/${projectId}/spans/${spanId}/events`,
    swrFetcher
  );
  const cleanedEvents = events?.map((event) => {
    const { spanId, projectId, ...rest } = event;
    return rest;
  });

  if (!span) {
    return (
      <div className="flex flex-col space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <>
      <Tabs className="flex flex-col h-full w-full" defaultValue="span">
        <div className="border-b flex-none">
          <div className="flex flex-col px-4 pt-2 gap-2">
            <div className='flex flex-col gap-2'>
              <div className="flex flex-none items-center space-x-2">
                <div className="p-1.5 px-2 text-xs text-secondary-foreground rounded bg-secondary">
                  {span.spanType === SpanType.DEFAULT && <Braces size={16} />}
                  {span.spanType === SpanType.LLM && (
                    <MessageCircleMore size={16} />
                  )}
                  {span.spanType === SpanType.EXECUTOR && <Activity size={16} />}
                  {span.spanType === SpanType.EVALUATOR && (
                    <ArrowRight size={16} />
                  )}
                  {span.spanType === SpanType.EVALUATION && <Gauge size={16} />}
                </div>
                <div className="flex-grow text-xl items-center font-medium truncate max-w-[400px]">
                  {span.name}
                </div>
              </div>
              <MonoWithCopy className="text-muted-foreground">{span.spanId}</MonoWithCopy>
            </div>
            <div className="flex-none flex flex-row space-x-2">
              <AddToLabelingQueuePopover span={span} />
              <ExportSpansDialog span={span} />
              <AddLabelPopover span={span} />
            </div>
            <div className="flex flex-col py-1 space-y-2">
              <StatsShields
                startTime={span.startTime}
                endTime={span.endTime}
                totalTokenCount={
                  (span.attributes['gen_ai.usage.input_tokens'] ?? 0) +
                  (span.attributes['gen_ai.usage.output_tokens'] ?? 0)
                }
                inputTokenCount={
                  span.attributes['gen_ai.usage.input_tokens'] ?? 0
                }
                outputTokenCount={
                  span.attributes['gen_ai.usage.output_tokens'] ?? 0
                }
                inputCost={span.attributes['gen_ai.usage.input_cost'] ?? 0}
                outputCost={span.attributes['gen_ai.usage.output_cost'] ?? 0}
                cost={span.attributes['gen_ai.usage.cost'] ?? 0}
              />
            </div>
          </div>
          <TabsList className="border-none text-sm px-4">
            <TabsTrigger value="span" className="z-50">
              Span
            </TabsTrigger>
            <TabsTrigger value="attributes" className="z-50">
              Attributes
            </TabsTrigger>
            <TabsTrigger value="events" className="z-50">
              Events
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-grow flex">
          <TabsContent value="span" className="h-full w-full mt-0">
            <SpanViewSpan span={span} />
          </TabsContent>
          <TabsContent value="attributes" className="h-full w-full mt-0">
            {span ? (
              <Formatter
                className="border-none rounded-none"
                value={JSON.stringify(span.attributes)}
                defaultMode="yaml"
              />
            ) : (
              <Skeleton className="h-8" />
            )}
          </TabsContent>
          <TabsContent value="events" className="h-full w-full mt-0">
            <Formatter
              className="h-full border-none rounded-none"
              value={JSON.stringify(cleanedEvents)}
              defaultMode="yaml"
            />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
