"use client";
import React, { useMemo } from "react";
import useSWR from "swr";

import ErrorCard from "@/components/traces/error-card";
import SpanInput from "@/components/traces/span-input";
import SpanOutput from "@/components/traces/span-output";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import StatsShields from "@/components/traces/stats-shields";
import { Badge } from "@/components/ui/badge";
import Formatter from "@/components/ui/formatter";
import MonoWithCopy from "@/components/ui/mono-with-copy";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Event } from "@/lib/events/types";
import { Span, SpanLabel } from "@/lib/traces/types";
import { ErrorEventAttributes } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface SpanViewProps {
  span: Span;
  traceId: string;
}

export function SpanView({ span, traceId }: SpanViewProps) {
  const { data: events = [] } = useSWR<Event[]>(
    `/api/shared/traces/${traceId}/spans/${span.spanId}/events`,
    swrFetcher
  );
  const { data: labels = [] } = useSWR<SpanLabel[]>(
    `/api/shared/traces/${traceId}/spans/${span.spanId}/labels`,
    swrFetcher
  );

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
              <StatsShields
                startTime={span.startTime}
                endTime={span.endTime}
                totalTokenCount={
                  (span.attributes["gen_ai.usage.input_tokens"] ?? 0) +
                  (span.attributes["gen_ai.usage.output_tokens"] ?? 0)
                }
                inputTokenCount={span.attributes["gen_ai.usage.input_tokens"] ?? 0}
                outputTokenCount={span.attributes["gen_ai.usage.output_tokens"] ?? 0}
                inputCost={span.attributes["gen_ai.usage.input_cost"] ?? 0}
                outputCost={span.attributes["gen_ai.usage.output_cost"] ?? 0}
                cost={span.attributes["gen_ai.usage.cost"] ?? 0}
              />
              <div className="flex flex-row text-xs font-mono space-x-2 rounded-md p-0.5 px-2 border items-center">
                {new Date(span.startTime).toLocaleString()}
              </div>
            </div>
            {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
            <div className="flex flex-wrap w-fit items-center gap-2">
              {labels.map((l) => (
                <Badge key={l.id} className="rounded-3xl" variant="outline">
                  <div style={{ background: l.color }} className={`w-2 h-2 rounded-full`} />
                  <span className="ml-1.5">{l.name}</span>
                </Badge>
              ))}
            </div>
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
              <SpanInput span={span} />
            </TabsContent>
            <TabsContent value="span-output" className="w-full h-full">
              <SpanOutput span={span} />
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
