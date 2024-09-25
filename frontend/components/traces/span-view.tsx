import { getDurationString, isChatMessageList, renderNodeInput } from "@/lib/flow/utils";
import { GraphMessage } from "@/lib/pipeline/types";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useProjectContext } from "@/contexts/project-context";
import { formatTimestamp, swrFetcher } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ScrollArea } from "../ui/scroll-area";
import Formatter from "../ui/formatter";
import { Span, SpanType } from "@/lib/traces/types";
import { Button } from "../ui/button";
import { Activity, ArrowRight, Braces, CircleDollarSign, Clock3, Coins, Gauge, MessageCircleMore, X } from "lucide-react";
import SpanEvents from "./span-events";
import ChatMessageListTab from "./chat-message-list-tab";
import { Label } from "../ui/label";
import SpanLabels from "./span-labels";
import { AddLabelPopover } from "./add-label-popover";
import ExportSpansDialog from "./export-spans-dialog";

interface SpanViewProps {
  spanPreview: Span;
  onCloseClick?: () => void;
}

type TabName = 'span' | 'events' | 'attributes' | 'labels';

export function SpanView({ spanPreview, onCloseClick }: SpanViewProps) {

  const { projectId } = useProjectContext();
  const [selectedTab, setSelectedTab] = useState<TabName>('span')

  const { data: span }: { data: Span } = useSWR(`/api/projects/${projectId}/spans/${spanPreview.spanId}`, swrFetcher)

  return (
    <>
      <Tabs
        className='flex flex-col flex-grow'
        defaultValue='span'
        onValueChange={(value) => setSelectedTab(value as TabName)}
      >
        <div className='border-b flex-none'>
          <div className="flex flex-col">
            <div className='flex flex-none h-12 items-center px-4 space-x-2'>
              <div className="p-1.5 px-2 text-xs text-secondary-foreground rounded bg-secondary">
                {spanPreview.spanType === SpanType.DEFAULT && <Braces size={16} />}
                {spanPreview.spanType === SpanType.LLM && <MessageCircleMore size={16} />}
                {spanPreview.spanType === SpanType.EXECUTOR && <Activity size={16} />}
                {spanPreview.spanType === SpanType.EVALUATOR && <ArrowRight size={16} />}
                {spanPreview.spanType === SpanType.EVALUATION && <Gauge size={16} />}
              </div>
              <div className="flex-grow text-xl items-center font-medium truncate max-w-[400px]">{spanPreview.name}</div>
              <div className="flex-grow"></div>
              <Button variant='secondary' onClick={() => onCloseClick?.()}>
                Timeline
              </Button>
              <div>
                {/* <ExportSpansDialog spanId={spanPreview.spanId} /> */}
              </div>
              <div>
                <AddLabelPopover
                  spanId={spanPreview.spanId}
                />
              </div>
            </div>
            <div className="flex-grow flex flex-col px-4 py-1 space-y-2">
              {span ? (
                <div className="flex space-x-2 items-center">
                  <div className='flex space-x-1 items-center p-0.5 px-2 border rounded-md'>
                    <Clock3 size={12} />
                    <Label className='text-secondary-foreground text-sm'>{getDurationString(span.startTime, span.endTime)}</Label>
                  </div>
                  <div className='flex space-x-1 items-center p-0.5 px-2 border rounded-md'>
                    <Coins size={12} />
                    <Label className='text-secondary-foreground text-sm'>
                      {span.attributes["llm.usage.total_tokens"] ?? 0}
                    </Label>
                  </div>
                  <div className='flex space-x-1 items-center p-0.5 px-2 border rounded-md'>
                    <CircleDollarSign size={12} />
                    <Label className='text-secondary-foreground text-sm'>${span.attributes["gen_ai.usage.cost"]?.toFixed(5) ?? 0}</Label>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-7 w-full" />
              )}
            </div>
          </div>
          <TabsList className="border-none text-sm px-4">
            <TabsTrigger value="span" className="z-50">Span</TabsTrigger>
            <TabsTrigger value="attributes" className="z-50">Attributes</TabsTrigger>
            <TabsTrigger value="events" className="z-50">Events</TabsTrigger>
            <TabsTrigger value="labels" className="z-50">Labels</TabsTrigger>
          </TabsList>
        </div >
        <div className='flex-grow flex'>
          <TabsContent
            value="span"
            className='h-full w-full mt-0'
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full mt-0'>
                <div className='flex flex-col max-h-0'>
                  {
                    span ? (
                      <div>
                        <div className='p-4 w-full h-full'>
                          <div className="pb-2 font-medium text-lg">
                            Input
                          </div>
                          {(isChatMessageList(span.input)) ?
                            <ChatMessageListTab messages={span.input} />
                            : (
                              <Formatter className="max-h-1/3" value={JSON.stringify(span.input)} />
                            )
                          }
                        </div>
                        <div className='p-4 w-full h-full'>
                          <div className="pb-2 font-medium text-lg">
                            Output
                          </div>
                          <Formatter className="max-h-[600px]" value={typeof span.output === 'string' ? span.output : JSON.stringify(span.output)} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-2 p-4">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    )
                  }
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent
            value="attributes"
            className='flex-grow w-full mt-0'
          >
            <div className='h-full w-full'>
              <div className="p-4">
                {
                  span ? (
                    <Formatter className="max-h-[600px]" value={JSON.stringify(span.attributes)} defaultMode="yaml" />
                  ) : (
                    <Skeleton className="h-8" />
                  )
                }
              </div>
            </div>
          </TabsContent>
          <TabsContent
            value="events"
            className='h-full w-full mt-0'
          >
            <div className='flex h-full w-full relative'>
              <SpanEvents span={span} />
            </div>
          </TabsContent>
          <TabsContent
            value='labels'
            className='w-full h-full mt-0'
          >
            <div className='flex h-full w-full relative'>
              <SpanLabels spanId={spanPreview.spanId} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </>
  )
}
