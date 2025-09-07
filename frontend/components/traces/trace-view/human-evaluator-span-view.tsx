import { get, omit } from "lodash";
import { useParams, useSearchParams } from "next/navigation";
import React, { useMemo } from "react";
import useSWR from "swr";

import { useSearchHighlight } from "@/components/traces/hooks/use-search-highlight";
import { SpanControls } from "@/components/traces/span-controls";
import SpanMessages from "@/components/traces/span-view/span-content";
import HumanEvaluationScore from "@/components/traces/trace-view/human-evaluation-score";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Event } from "@/lib/events/types";
import { Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

interface HumanEvaluatorSpanViewProps {
  spanId: string;
  searchTerm?: string;
}

export function HumanEvaluatorSpanView({ spanId, searchTerm = "" }: HumanEvaluatorSpanViewProps) {
  const { projectId, evaluationId: evaluationIdParams } = useParams();
  const searchParams = useSearchParams();
  const evaluationId = (evaluationIdParams || searchParams.get("evaluationId")) as string | null;
  const datapointId = searchParams.get("datapointId");
  const { data: span, isLoading } = useSWR<Span>(`/api/projects/${projectId}/spans/${spanId}`, swrFetcher);
  const { data: events } = useSWR<Event[]>(`/api/projects/${projectId}/spans/${spanId}/events`, swrFetcher);
  const cleanedEvents = useMemo(() => events?.map((event) => omit(event, ["spanId", "projectId"])), [events]);
  const containerRef = useSearchHighlight(searchTerm, isLoading, spanId);

  const humanEvaluatorOptions = useMemo(() => {
    try {
      const options = get(span?.attributes, "lmnr.span.human_evaluator_options");
      if (options) {
        return JSON.parse(options) as { value: number; label: string }[];
      }
    } catch { }
  }, [span?.attributes]);

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
    <div ref={containerRef}>
      <SpanControls span={span}>
        <Tabs className="flex flex-col flex-1 w-full overflow-hidden" defaultValue="span">
          <div className="border-b flex-shrink-0">
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
          <div className="flex-1 flex overflow-hidden">
            <TabsContent value="span" className="w-full h-full">
              <SpanMessages type="input" key={`${datapointId}-${spanId}`} span={span}>
                {datapointId && evaluationId && (
                  <HumanEvaluationScore
                    options={humanEvaluatorOptions}
                    key={`${datapointId}-${spanId}`}
                    evaluationId={evaluationId as string}
                    spanId={span.spanId}
                    resultId={datapointId}
                    name={span.name}
                    projectId={projectId as string}
                  />
                )}
              </SpanMessages>
            </TabsContent>
            <TabsContent value="attributes" className="h-full w-full">
              <CodeHighlighter
                className="border-none"
                readOnly
                value={JSON.stringify(span.attributes)}
                defaultMode="yaml"
              />
            </TabsContent>
            <TabsContent value="events" className="h-full w-full mt-0">
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
    </div>
  );
}
