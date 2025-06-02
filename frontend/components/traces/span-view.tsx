import { get, omit } from "lodash";
import { PlayCircle } from "lucide-react";
import Link from "next/link";
import React, { useMemo } from "react";
import useSWR from "swr";

import EvaluatorScoresList from "@/components/evaluators/evaluator-scores-list";
import RegisterEvaluatorPopover from "@/components/evaluators/register-evaluator-popover";
import LabelsContextProvider from "@/components/labels/labels-context";
import LabelsList from "@/components/labels/labels-list";
import LabelsTrigger from "@/components/labels/labels-trigger";
import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import ErrorCard from "@/components/traces/error-card";
import ExportSpansPopover from "@/components/traces/export-spans-popover";
import SpanInput from "@/components/traces/span-input";
import SpanOutput from "@/components/traces/span-output";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectContext } from "@/contexts/project-context";
import { Event } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import { Span, SpanType } from "@/lib/traces/types";
import { ErrorEventAttributes } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

import Formatter from "../ui/formatter";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import SpanTypeIcon from "./span-type-icon";
import StatsShields from "./stats-shields";

interface SpanViewProps {
  spanId: string;
}

export function SpanView({ spanId }: SpanViewProps) {
  const { projectId } = useProjectContext();
  const { data: span, isLoading } = useSWR<Span>(`/api/projects/${projectId}/spans/${spanId}`, swrFetcher);
  const { data: events } = useSWR<Event[]>(`/api/projects/${projectId}/spans/${spanId}/events`, swrFetcher);
  const cleanedEvents = useMemo(() => events?.map((event) => omit(event, ["spanId", "projectId"])), [events]);
  const { toast } = useToast();

  const copySpanId = () => {
    if (span) {
      navigator.clipboard.writeText(span.spanId);
      toast({
        title: "Copied span ID",
        description: "Span ID has been copied to clipboard",
        variant: "default",
      });
    }
  };

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
      <Tabs className="flex flex-col h-full w-full overflow-hidden" defaultValue="span-input">
        <div className="border-b flex-none">
          <div className="flex flex-col px-4 pt-4 gap-2">
            <div className="flex flex-none items-center space-x-2">
              <SpanTypeIcon spanType={span.spanType} />
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-xl items-center font-medium truncate cursor-pointer" onClick={copySpanId}>
                      {span.name}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Click to copy span ID</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {span.spanType === SpanType.LLM && (
                <Link
                  href={{ pathname: `/project/${projectId}/playgrounds/create`, query: { spanId: span.spanId } }}
                  passHref
                >
                  <Button variant="outlinePrimary" className="px-1.5">
                    <PlayCircle className="mr-2" size={16} />
                    Open in Playground
                  </Button>
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <StatsShields
                className="flex-wrap"
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
              <div className="text-xs font-mono space-x-2 rounded-md p-0.5 truncate px-2 border items-center">
                {new Date(span.startTime).toLocaleString()}
              </div>
            </div>
            <LabelsContextProvider spanId={spanId}>
              <div className="flex gap-2 flex-wrap items-center">
                <LabelsTrigger />
                <RegisterEvaluatorPopover spanPath={get(span.attributes, "lmnr.span.path", [])} />
                <AddToLabelingQueuePopover
                  data={[
                    {
                      payload: { data: span.input, target: span.output, metadata: {} },
                      metadata: { source: "span", id: span.spanId, traceId: span.traceId },
                    },
                  ]}
                />
                <ExportSpansPopover span={span} />
              </div>
              <LabelsList />
              <EvaluatorScoresList spanId={spanId} />
            </LabelsContextProvider>
            {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
          </div>
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
        <div className="flex-grow flex overflow-hidden">
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
      </Tabs>
    </>
  );
}
