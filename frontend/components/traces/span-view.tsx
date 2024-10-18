import { getDurationString, isChatMessageList } from '@/lib/flow/utils';
import useSWR from 'swr';
import { useProjectContext } from '@/contexts/project-context';
import { swrFetcher } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import Formatter from '../ui/formatter';
import { Span, SpanType } from '@/lib/traces/types';
import {
  Activity,
  ArrowRight,
  Braces,
  CircleDollarSign,
  Clock3,
  Coins,
  Gauge,
  MessageCircleMore,
  X
} from 'lucide-react';
import SpanEvents from './span-events';
import ChatMessageListTab from './chat-message-list-tab';
import { Label } from '../ui/label';
import SpanLabels from './span-labels';
import { AddLabelPopover } from './add-label-popover';
import ExportSpansDialog from './export-spans-dialog';
import { EvaluatorEditorDialog } from '../evaluator/evaluator-editor-dialog';
import { SpanViewSpan } from './span-view-span';
import StatsShields from './stats-shields';

interface SpanViewProps {
  spanId: string;
}

export function SpanView({ spanId }: SpanViewProps) {
  const { projectId } = useProjectContext();
  const { data: span }: { data: Span } = useSWR(
    `/api/projects/${projectId}/spans/${spanId}`,
    swrFetcher
  );

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
      <Tabs className="flex flex-col flex-grow" defaultValue="span">
        <div className="border-b flex-none">
          <div className="flex flex-col">
            <div className="flex flex-none h-12 items-center px-4 space-x-2">
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
              <div className="flex-grow"></div>
              <div>
                <ExportSpansDialog span={span} />
              </div>
              <div>
                <AddLabelPopover span={span} />
              </div>
            </div>
            <div className="flex-grow flex flex-col px-4 py-1 space-y-2">
              <StatsShields
                startTime={span.startTime}
                endTime={span.endTime}
                totalTokenCount={span.attributes['llm.usage.total_tokens'] ?? 0}
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
          <TabsContent value="attributes" className="flex-grow w-full mt-0">
            <div className="h-full w-full">
              <div className="p-4">
                {span ? (
                  <Formatter
                    className="max-h-[600px]"
                    value={JSON.stringify(span.attributes)}
                    defaultMode="yaml"
                  />
                ) : (
                  <Skeleton className="h-8" />
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="events" className="h-full w-full mt-0">
            <div className="flex h-full w-full relative">
              <SpanEvents span={span} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
