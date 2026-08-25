import { useParams, useSearchParams } from "next/navigation";
import React from "react";
import useSWR from "swr";

import { SpanControls } from "@/components/traces/span-controls";
import SpanMessages from "@/components/traces/span-view/span-content";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

interface HumanEvaluatorSpanViewProps {
  spanId: string;
  traceId: string;
  onClose?: () => void;
  isAlwaysSelectSpan?: boolean;
}

export function HumanEvaluatorSpanView({ spanId, traceId, onClose, isAlwaysSelectSpan }: HumanEvaluatorSpanViewProps) {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const datapointId = searchParams.get("datapointId");
  const { data: span, isLoading } = useSWR<Span>(
    `/api/projects/${projectId}/traces/${traceId}/spans/${spanId}`,
    swrFetcher
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

  if (span.attributes["gen_ai.prompt.user"]) {
    return (
      <div className="whitespace-pre-wrap p-4 border rounded-md bg-muted/50">
        {span.attributes["gen_ai.prompt.user"]}
      </div>
    );
  }

  return (
    <SpanControls span={span} onClose={onClose} isAlwaysSelectSpan={isAlwaysSelectSpan}>
      <Tabs className="flex flex-col flex-1 w-full overflow-hidden" defaultValue="span">
        <div className="px-2 pb-2 mt-2 border-b w-full">
          <TabsList className="border-none text-xs h-7">
            <TabsTrigger value="span" className="text-xs">
              Span Input
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
          <TabsContent value="span" className="w-full h-full">
            <div className="flex flex-col h-full">
              <SpanMessages type="input" key={`${datapointId}-${spanId}`} span={span}></SpanMessages>
            </div>
          </TabsContent>
          <TabsContent value="attributes" className="h-full w-full">
            <ContentRenderer
              className="border-none"
              readOnly
              value={JSON.stringify(span.attributes)}
              defaultMode="yaml"
            />
          </TabsContent>
          <TabsContent value="events" className="h-full w-full mt-0">
            <ContentRenderer className="border-none" readOnly value={JSON.stringify(span.events)} defaultMode="yaml" />
          </TabsContent>
        </div>
      </Tabs>
    </SpanControls>
  );
}
