import { omit } from "lodash";
import { useParams } from "next/navigation";
import React, { useMemo } from "react";
import useSWR from "swr";

import { SpanControls } from "@/components/traces/span-controls";
import SpanContent from "@/components/traces/span-view/span-content";
import { SpanViewStateProvider } from "@/components/traces/span-view/span-view-store";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Skeleton } from "@/components/ui/skeleton";
import { Event } from "@/lib/events/types";
import { Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";

interface SpanViewProps {
  spanId: string;
}

export function SpanView({ spanId }: SpanViewProps) {
  const { projectId } = useParams();
  const { data: span, isLoading } = useSWR<Span>(`/api/projects/${projectId}/spans/${spanId}`, swrFetcher);
  const { data: events } = useSWR<Event[]>(`/api/projects/${projectId}/spans/${spanId}/events`, swrFetcher);

  const cleanedEvents = useMemo(() => events?.map((event) => omit(event, ["spanId", "projectId"])), [events]);

  if (isLoading || !span || span.attributes === null) {
    return (
      <div className="flex flex-col space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (span.attributes["gen_ai.prompt.user"]) {
    return (
      <div className="whitespace-pre-wrap p-4 border rounded-md bg-muted/50">
        {span.attributes["gen_ai.prompt.user"]}
      </div>
    );
  }

  return (
    <SpanViewStateProvider>
      <SpanControls events={cleanedEvents} span={span}>
        <Tabs className="flex flex-col flex-1 w-full overflow-hidden" defaultValue="span-input">
          <div className="border-b flex-shrink-0">
            <TabsList className="border-none text-sm px-4">
              <TabsTrigger value="span-input" className="truncate">
                Span Input
              </TabsTrigger>
              <TabsTrigger value="span-output" className="truncate">
                Span Output
              </TabsTrigger>
              <TabsTrigger value="attributes" className="truncate">
                Attributes
              </TabsTrigger>
              <TabsTrigger value="events" className="truncate">
                Events
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 flex overflow-hidden">
            <TabsContent value="span-input" className="w-full h-full">
              <SpanContent span={span} type="input" />
            </TabsContent>
            <TabsContent value="span-output" className="w-full h-full">
              <SpanContent span={span} type="output" />
            </TabsContent>
            <TabsContent value="attributes" className="w-full h-full">
              <CodeHighlighter
                className="border-none"
                readOnly
                value={JSON.stringify(span.attributes)}
                defaultMode="yaml"
              />
            </TabsContent>
            <TabsContent value="events" className="w-full h-full">
              <CodeHighlighter
                className="border-none"
                readOnly
                value={JSON.stringify(cleanedEvents)}
                defaultMode="yaml"
              />
            </TabsContent>
          </div>
        </Tabs>
      </SpanControls>
    </SpanViewStateProvider>
  );
}
