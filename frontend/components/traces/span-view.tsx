import { renderNodeInput } from "@/lib/flow/utils";
import { GraphMessage } from "@/lib/pipeline/types";
import { useState } from "react";
import useSWR from "swr";
import { useProjectContext } from "@/contexts/project-context";
import { swrFetcher } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ScrollArea } from "../ui/scroll-area";
import Formatter from "../ui/formatter";
import { Span, SpanPreview } from "@/lib/traces/types";
import { Button } from "../ui/button";
import { X } from "lucide-react";
import SpanEvents from "./span-events";

interface SpanViewProps {
  spanPreview: SpanPreview;
  onCloseClick?: () => void;
}

export function SpanView({ spanPreview, onCloseClick }: SpanViewProps) {

  const { projectId } = useProjectContext();
  const [selectedTab, setSelectedTab] = useState<'output' | 'inputs' | 'metadata' | 'events' | 'attributes'>('output')

  const url = `/api/projects/${projectId}/traces/${spanPreview.traceId}/spans/${spanPreview.id}`;
  const { data: span }: { data: Span } = useSWR(url, swrFetcher)

  return (
    <>
      <Tabs
        className='flex flex-col flex-grow'
        defaultValue='output'
        onValueChange={(value) => setSelectedTab(value as 'output' | 'inputs' | 'metadata')}
      >
        <div className='border-b flex-none'>
          <div className='flex flex-none h-12 items-center px-4 space-x-2'>
            <div className="p-1 px-2 text-xs text-secondary-foreground rounded bg-secondary">{spanPreview.spanType === "DEFAULT" ? "SPAN" : "LLM"}</div>
            <div className="flex-grow">{spanPreview.name}</div>
            <Button variant='ghost' onClick={() => onCloseClick?.()}>
              <X size={20} />
            </Button>
          </div>
          <TabsList className="border-none text-sm px-4">
            <TabsTrigger value="output">Output</TabsTrigger>
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="attributes">Attributes</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
          </TabsList>
        </div>
        <div className='flex-grow'>
          <TabsContent
            value="output"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'output'}
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full mt-0'>
                <div className='flex max-h-0'>
                  <div className='p-4 w-full h-full'>
                    {
                      span ? (
                        <Formatter value={JSON.stringify(span.output)} />
                      ) : (
                        <Skeleton className="h-8" />
                      )
                    }
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent
            value="inputs"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'inputs'}
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full mt-0'>
                <div className='flex max-h-0'>
                  <div className='p-4 w-full h-full'>
                    {
                      span ? (
                        <Formatter value={JSON.stringify(span.input)} />
                      ) : (
                        <Skeleton className="h-8" />
                      )
                    }
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent
            value="attributes"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'attributes'}
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full mt-0'>
                <div className='flex max-h-0'>
                  <div className='p-4 w-full h-full'>
                    {
                      span ? (
                        <Formatter value={JSON.stringify(span.attributes)} defaultMode="yaml" />
                      ) : (
                        <Skeleton className="h-8" />
                      )
                    }
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent
            value="events"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'events'}
          >
            <div className='flex h-full w-full'>
              <SpanEvents span={span} />
            </div>
          </TabsContent>
          <TabsContent
            value="metadata"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'metadata'}
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full mt-0'>
                <div className='flex max-h-0'>
                  <div className='p-4 w-full h-full'>
                    {
                      span ? (
                        <Formatter value={JSON.stringify(span.metadata)} />
                      ) : (
                        <Skeleton className="h-8" />
                      )
                    }
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </>
  )
}
