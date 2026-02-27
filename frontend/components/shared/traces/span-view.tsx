"use client";
import React, { useMemo } from "react";
import useSWR from "swr";

import ErrorCard from "@/components/traces/error-card";
import { ModelIndicator } from "@/components/traces/model-indicator";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import SpanContent from "@/components/traces/span-view/span-content.tsx";
import { SpanViewStateProvider } from "@/components/traces/span-view/span-view-store";
import SpanStatsShields from "@/components/traces/stats-shields";
import { StructuredOutputSchema } from "@/components/traces/structured-output-schema";
import { extractToolsFromAttributes, ToolList } from "@/components/traces/tool-list";
import ContentRenderer from "@/components/ui/content-renderer";
import MonoWithCopy from "@/components/ui/mono-with-copy";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseTimestampToDate } from "@/lib/time/timestamp";
import { type Span } from "@/lib/traces/types";
import { type ErrorEventAttributes } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface SpanViewProps {
  spanId: string;
  traceId: string;
}

export function SpanView({ spanId, traceId }: SpanViewProps) {
  const { data: span, isLoading } = useSWR<Span>(`/api/shared/traces/${traceId}/spans/${spanId}`, swrFetcher);

  const errorEventAttributes = useMemo(
    () => span?.events?.find((e) => e.name === "exception")?.attributes as ErrorEventAttributes,
    [span?.events]
  );

  if (isLoading || !span) {
    return (
      <div className="flex flex-col space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <SpanViewStateProvider>
      <Tabs className="flex flex-col h-full w-full" defaultValue="span-input">
        <div className="flex-none">
          <div className="flex flex-col px-4 pt-2 gap-1">
            <div className="flex flex-col gap-1">
              <div className="flex flex-none items-center space-x-2">
                <SpanTypeIcon spanType={span.spanType} />
                <div className="text-xl items-center font-medium truncate">{span.name}</div>
              </div>
              <MonoWithCopy className="text-muted-foreground">{span.spanId}</MonoWithCopy>
            </div>
            <div className="flex flex-col gap-1.5 py-1">
              <div className="flex items-center gap-2 flex-wrap">
                <SpanStatsShields span={span} variant="outline" />
                <div className="text-xs font-mono rounded-md py-0.5 px-2 border border-muted">
                  {parseTimestampToDate(span.startTime).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <ModelIndicator attributes={span.attributes} />
                <ToolList tools={extractToolsFromAttributes(span.attributes)} />
                <StructuredOutputSchema
                  schema={
                    span.attributes?.["gen_ai.request.structured_output_schema"] || span.attributes?.["ai.schema"]
                  }
                />
              </div>
            </div>
            {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
          </div>
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
        </div>
        <div className="grow flex overflow-hidden">
          <TabsContent value="span-input" className="w-full h-full">
            <SpanContent span={span} type="input" />
          </TabsContent>
          <TabsContent value="span-output" className="w-full h-full">
            <SpanContent span={span} type="output" />
          </TabsContent>
          <TabsContent value="attributes" className="w-full h-full">
            <ContentRenderer
              className="rounded-none border-0"
              codeEditorClassName="rounded-none border-none bg-background contain-strict"
              readOnly
              value={JSON.stringify(span.attributes)}
              defaultMode="yaml"
            />
          </TabsContent>
          <TabsContent value="events" className="w-full h-full">
            <ContentRenderer
              className="rounded-none border-0"
              codeEditorClassName="rounded-none border-none bg-background contain-strict"
              readOnly
              value={JSON.stringify(span.events)}
              defaultMode="yaml"
            />
          </TabsContent>
        </div>
      </Tabs>
    </SpanViewStateProvider>
  );
}
