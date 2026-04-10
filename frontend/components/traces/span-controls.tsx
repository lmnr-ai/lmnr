import { ChevronDown, Copy, Database, Loader, PlayCircle, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useMemo } from "react";

import EvaluatorScoresList from "@/components/evaluators/evaluator-scores-list";
import SpanTagsList from "@/components/tags/span-tags-list";
import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import ErrorCard from "@/components/traces/error-card";
import ExportSpansPopover from "@/components/traces/export-spans-popover";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { type Span, SpanType } from "@/lib/traces/types";
import { type ErrorEventAttributes } from "@/lib/types";

import { ModelIndicator } from "./model-indicator";
import SpanTypeIcon from "./span-type-icon";
import SpanStatsShields from "./stats-shields";
import { StructuredOutputSchema } from "./structured-output-schema";
import { extractToolsFromAttributes, ToolList } from "./tool-list";

interface SpanControlsProps {
  span: Span;
}

export function SpanControls({ children, span }: PropsWithChildren<SpanControlsProps>) {
  const { projectId } = useParams();
  const setSelectedSpan = useTraceViewBaseStore((state) => state.setSelectedSpan);
  const isAlwaysSelectSpan = useTraceViewBaseStore((state) => state.isAlwaysSelectSpan);

  const errorEventAttributes = useMemo(
    () => span.events?.find((e) => e.name === "exception")?.attributes as ErrorEventAttributes,
    [span.events]
  );

  const { toast } = useToast();
  const { openInSql, isLoading } = useOpenInSql({
    projectId: projectId as string,
    params: { type: "span", spanId: span.spanId, traceId: span.traceId },
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
                className="h-6 px-1 text-base font-medium focus-visible:outline-0 truncate text-left min-w-0"
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
          {!isAlwaysSelectSpan && (
            <Button
              variant="ghost"
              className="ml-auto px-0.5 h-6 w-6 flex-shrink-0"
              onClick={() => setSelectedSpan(undefined)}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-col flex-wrap gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <SpanStatsShields span={span} variant="outline" />
            <div className="text-xs font-mono rounded-md py-0.5 truncate px-2 border border-muted">
              {new Date(span.startTime).toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ModelIndicator attributes={span.attributes} />
            <ToolList tools={extractToolsFromAttributes(span.attributes)} />
            <StructuredOutputSchema
              schema={span.attributes?.["gen_ai.request.structured_output_schema"] || span.attributes?.["ai.schema"]}
            />
          </div>
          <div className="flex gap-2 gap-y-1 flex-wrap items-center">
            <AddToLabelingQueuePopover spanId={span.spanId} traceId={span.traceId} />
            <ExportSpansPopover span={span} />
            <SpanTagsList spanId={span.spanId} />
          </div>
          <EvaluatorScoresList spanId={span.spanId} />
        </div>

        {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
      </div>
      {children}
    </div>
  );
}
