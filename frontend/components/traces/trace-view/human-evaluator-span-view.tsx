import { omit } from "lodash";
import { useParams, useSearchParams } from "next/navigation";
import React, { useMemo } from "react";
import useSWR from "swr";

import { SpanControls } from "@/components/traces/span-controls";
import SpanInput from "@/components/traces/span-input";
import HumanEvaluationScore from "@/components/traces/trace-view/human-evaluation-score";
import Formatter from "@/components/ui/formatter";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Event } from "@/lib/events/types";
import { Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

interface HumanEvaluatorSpanViewProps {
  spanId: string;
}

export function HumanEvaluatorSpanView({ spanId }: HumanEvaluatorSpanViewProps) {
  const { projectId, evaluationId } = useParams();
  const searchParams = useSearchParams();
  const datapointId = searchParams.get("datapointId");
  const { data: span, isLoading } = useSWR<Span>(`/api/projects/${projectId}/spans/${spanId}`, swrFetcher);
  const { data: events } = useSWR<Event[]>(`/api/projects/${projectId}/spans/${spanId}/events`, swrFetcher);
  const cleanedEvents = useMemo(() => events?.map((event) => omit(event, ["spanId", "projectId"])), [events]);

  if (isLoading || !span) {
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
    <SpanControls span={span}>
      <Tabs className="flex flex-col h-full w-full overflow-hidden" defaultValue="span">
        <div className="border-b flex-none">
          <TabsList className="border-none text-sm px-4">
            <TabsTrigger value="span" className="truncate">
              Span
            </TabsTrigger>
            <TabsTrigger value="attributes" className="truncate">
              Attributes
            </TabsTrigger>
            <TabsTrigger value="events" className="truncate">
              Events
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-grow flex overflow-hidden">
          <TabsContent value="span" className="w-full h-full">
            <SpanInput key={datapointId} span={span}>
              {datapointId && evaluationId && (
                <HumanEvaluationScore
                  evaluationId={evaluationId as string}
                  spanId={span.spanId}
                  resultId={datapointId}
                  name={span.name}
                  projectId={projectId as string}
                />
              )}
            </SpanInput>
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
      </Tabs>
    </SpanControls>
  );
}
