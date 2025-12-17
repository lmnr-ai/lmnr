import { get } from "lodash";
import { ChevronDown, Copy, Database, Loader, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { PropsWithChildren, useCallback, useMemo } from "react";

import EvaluatorScoresList from "@/components/evaluators/evaluator-scores-list";
import RegisterEvaluatorPopover from "@/components/evaluators/register-evaluator-popover";
import TagsContextProvider from "@/components/tags/tags-context";
import TagsList from "@/components/tags/tags-list";
import TagsTrigger from "@/components/tags/tags-trigger";
import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import ErrorCard from "@/components/traces/error-card";
import ExportSpansPopover from "@/components/traces/export-spans-popover";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Event } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import { Span, SpanType } from "@/lib/traces/types";
import { ErrorEventAttributes } from "@/lib/types";

import SpanTypeIcon from "./span-type-icon";
import SpanStatsShields from "./stats-shields";

interface SpanControlsProps {
  span: Span;
  events?: Omit<Event, "projectId" | "spanId">[];
}

export function SpanControls({ children, span, events }: PropsWithChildren<SpanControlsProps>) {
  const { projectId } = useParams();

  const errorEventAttributes = useMemo(
    () => events?.find((e) => e.name === "exception")?.attributes as ErrorEventAttributes,
    [events]
  );

  const { toast } = useToast();
  const { openInSql, isLoading } = useOpenInSql({
    projectId: projectId as string,
    params: { type: "span", spanId: span.spanId },
  });

  const handleCopySpanId = useCallback(async () => {
    if (span?.spanId) {
      await navigator.clipboard.writeText(span.spanId);
      toast({ title: "Copied span ID", duration: 1000 });
    }
  }, [span?.spanId, toast]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex flex-col px-2 pt-2 gap-2">
        <div className="flex flex-none items-center space-x-2">
          <SpanTypeIcon spanType={span.spanType} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-6 px-1 text-xl font-medium focus-visible:outline-0 truncate text-left min-w-0"
              >
                <span className="truncate">{span.name}</span>
                <ChevronDown className="ml-1 min-w-3.5 size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleCopySpanId}>
                <Copy size={14} />
                Copy span ID
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLoading} onClick={openInSql}>
                {isLoading ? <Loader className="size-3.5" /> : <Database className="size-3.5" />}
                Open in SQL editor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {span.spanType === SpanType.LLM && (
            <Link
              href={{ pathname: `/project/${projectId}/playgrounds/create`, query: { spanId: span.spanId } }}
              passHref
            >
              <Button variant="outlinePrimary" className="px-1.5 text-xs h-6 font-mono bg-primary/10">
                <PlayCircle className="mr-1" size={14} />
                Experiment in playground
              </Button>
            </Link>
          )}
        </div>
        <div className="flex flex-col flex-wrap gap-1.5">
          <SpanStatsShields className="flex-wrap" span={span}>
            <div className="text-xs font-mono space-x-2 rounded-md p-0.5 truncate px-2 border items-center">
              {new Date(span.startTime).toLocaleString()}
            </div>
          </SpanStatsShields>
          <TagsContextProvider spanId={span.spanId}>
            <div className="flex gap-2 flex-wrap items-center">
              <TagsTrigger />
              <RegisterEvaluatorPopover spanPath={get(span.attributes, "lmnr.span.path", [])} />
              <AddToLabelingQueuePopover spanId={span.spanId} />
              <ExportSpansPopover span={span} />
            </div>
            <TagsList />
            <EvaluatorScoresList spanId={span.spanId} />
          </TagsContextProvider>
        </div>

        {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
      </div>
      {children}
    </div>
  );
}
