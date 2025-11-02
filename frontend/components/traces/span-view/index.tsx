import { get, omit } from "lodash";
import { CircleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useMemo } from "react";
import useSWR from "swr";

import { SpanControls } from "@/components/traces/span-controls";
import SpanContent from "@/components/traces/span-view/span-content";
import { SpanViewStateProvider } from "@/components/traces/span-view/span-view-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Skeleton } from "@/components/ui/skeleton";
import { Event } from "@/lib/events/types";
import { Span } from "@/lib/traces/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";

interface SpanViewProps {
  spanId: string;
  traceId: string;
}

const swrFetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const errorText = (await res.json()) as { error: string };

    throw new Error(errorText.error);
  }

  return res.json();
};

export function SpanView({ spanId, traceId }: SpanViewProps) {
  const { projectId } = useParams();
  const {
    data: span,
    isLoading,
    error,
  } = useSWR<Span>(`/api/projects/${projectId}/traces/${traceId}/spans/${spanId}`, swrFetcher);
  const { data: events } = useSWR<Event[]>(
    `/api/projects/${projectId}/traces/${traceId}/spans/${spanId}/events`,
    swrFetcher
  );

  const cleanedEvents = useMemo(() => events?.map((event) => omit(event, ["spanId", "projectId"])), [events]);

  if (isLoading) {
    return (
      <div className="flex flex-col space-y-2 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <div className="flex items-start gap-4">
            <CircleAlert className="w-4 h-4" />
            <div className="flex-1 space-y-1">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : JSON.stringify(error, null, 2)}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  if (span && get(span.attributes, "gen_ai.prompt.user")) {
    return (
      <div className="whitespace-pre-wrap p-4 border rounded-md bg-muted/50">
        {get(span.attributes, "gen_ai.prompt.user")}
      </div>
    );
  }

  if (span) {
    return (
      <SpanViewStateProvider>
        <SpanControls events={cleanedEvents} span={span}>
          <Tabs className="flex flex-1 overflow-hidden gap-0" defaultValue="span-input">
            <div className="px-2 pb-2 mt-2 border-b w-full">
              <TabsList className="border-none text-xs h-7">
                <TabsTrigger value="span-input" className="text-xs">
                  Span Input
                </TabsTrigger>
                <TabsTrigger value="span-output" className="text-xs">
                  Span Output
                </TabsTrigger>
                <TabsTrigger value="attributes" className="text-xs">
                  Attributes
                </TabsTrigger>
                <TabsTrigger value="events" className="text-xs">
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
                <ContentRenderer
                  className="rounded-none border-0"
                  codeEditorClassName="rounded-none border-none bg-background"
                  readOnly
                  value={JSON.stringify(span.attributes)}
                  defaultMode="yaml"
                />
              </TabsContent>
              <TabsContent value="events" className="w-full h-full">
                <ContentRenderer
                  className="rounded-none border-0"
                  codeEditorClassName="rounded-none border-none bg-background"
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
}
