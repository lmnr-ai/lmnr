"use client";
import React, { useMemo } from "react";
import useSWR from "swr";

import ErrorCard from "@/components/traces/error-card";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import SpanMessages from "@/components/traces/span-view/span-content";
import SpanStatsShields from "@/components/traces/stats-shields";
import Formatter from "@/components/ui/formatter";
import MonoWithCopy from "@/components/ui/mono-with-copy";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Event } from "@/lib/events/types";
import { Span } from "@/lib/traces/types";
import { ErrorEventAttributes } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface SpanViewProps {
  spanId: string;
  traceId: string;
}

export function SpanView({ spanId, traceId }: SpanViewProps) {
  const { data: span, isLoading } = useSWR<Span>(`/api/shared/traces/${traceId}/spans/${spanId}`, swrFetcher);
  const { data: events = [] } = useSWR<Event[]>(`/api/shared/traces/${traceId}/spans/${spanId}/events`, swrFetcher);

  const cleanedEvents = useMemo(
    () =>
      events?.map((event) => {
        const { spanId, projectId, ...rest } = event;
        return rest;
      }),
    [events]
  );

  const errorEventAttributes = useMemo(
    () => cleanedEvents?.find((e) => e.name === "exception")?.attributes as ErrorEventAttributes,
    [cleanedEvents]
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
    <>
      <Tabs className="flex flex-col h-full w-full" defaultValue="span-input">
        <div className="border-b flex-none">
          <div className="flex flex-col px-4 pt-2 gap-1">
            <div className="flex flex-col gap-1">
              <div className="flex flex-none items-center space-x-2">
                <SpanTypeIcon spanType={span.spanType} />
                <div className="text-xl items-center font-medium truncate">{span.name}</div>
              </div>
              <MonoWithCopy className="text-muted-foreground">{span.spanId}</MonoWithCopy>
            </div>
            <div className="flex flex-wrap py-1 gap-2">
              <SpanStatsShields startTime={span.startTime} endTime={span.endTime} attributes={span.attributes}>
                <div className="flex flex-row text-xs font-mono space-x-2 rounded-md p-0.5 px-2 border items-center">
                  {new Date(span.startTime).toLocaleString()}
                </div>
              </SpanStatsShields>
            </div>
            {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
          </div>
          <TabsList className="border-none text-sm px-4">
            <TabsTrigger value="span-input" className="z-50">
              Span Input
            </TabsTrigger>
            <TabsTrigger value="span-output" className="z-50">
              Span Output
            </TabsTrigger>
            <TabsTrigger value="attributes" className="z-50">
              Attributes
            </TabsTrigger>
            <TabsTrigger value="events" className="z-50">
              Events
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-grow flex h-0">
          <div className="flex-grow flex flex-col">
            <TabsContent value="span-input" className="w-full h-full">
              <SpanMessages span={span} type="input" />
            </TabsContent>
            <TabsContent value="span-output" className="w-full h-full">
              <SpanMessages span={span} type="output" />
            </TabsContent>
            <TabsContent value="attributes" className="h-full w-full">
              <Formatter
                className="border-none rounded-none"
                value={JSON.stringify(span.attributes)}
                defaultMode="yaml"
              />
            </TabsContent>
            <TabsContent value="events" className="h-full w-full mt-0">
              <Formatter
                className="h-full border-none rounded-none"
                value={JSON.stringify(cleanedEvents)}
                defaultMode="yaml"
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </>
  );
}
