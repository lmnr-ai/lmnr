import { X } from "lucide-react";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useMemo } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTagsList from "@/components/tags/span-tags-list";
import ErrorCard from "@/components/traces/error-card";
import SpanActionsDropdown from "@/components/traces/span-actions-dropdown";
import SpanCopyIdDropdown from "@/components/traces/span-copy-id-dropdown";
import { Button } from "@/components/ui/button";
import { type Span } from "@/lib/traces/types";
import { type ErrorEventAttributes } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ModelIndicator } from "./model-indicator";
import SpanTypeIcon from "./span-type-icon";
import SpanStatsShields from "./stats-shields";
import { StructuredOutputSchema } from "./structured-output-schema";
import { resolveTools, ToolList } from "./tool-list";

interface SpanControlsProps {
  span: Span;
  onClose?: () => void;
  isAlwaysSelectSpan?: boolean;
  /** Public shared page: no projectId in the route, so project-scoped actions and tags are dropped. */
  isShared?: boolean;
}

export function SpanControls({
  children,
  span,
  onClose,
  isAlwaysSelectSpan,
  isShared = false,
}: PropsWithChildren<SpanControlsProps>) {
  const { projectId } = useParams();

  const errorEventAttributes = useMemo(
    () => span.events?.find((e) => e.name === "exception")?.attributes as ErrorEventAttributes,
    [span.events]
  );

  const tools = resolveTools(span);
  const schema = span.attributes?.["gen_ai.request.structured_output_schema"] || span.attributes?.["ai.schema"];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex flex-col px-2 pt-2 gap-2">
        <div className="flex flex-none items-center gap-2 overflow-hidden">
          <SpanTypeIcon spanType={span.spanType} />
          <div className="min-w-0 overflow-hidden">
            {isShared ? (
              <SpanCopyIdDropdown span={span} />
            ) : (
              <SpanActionsDropdown projectId={projectId as string} span={span} />
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                // Always-select layouts only stack below STACK_THRESHOLD; that's the only time closing makes sense.
                className={cn("flex-shrink-0 hover:bg-surface-up", isAlwaysSelectSpan && "@min-[760px]:hidden")}
                onClick={onClose}
                aria-label="Close span panel"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModelIndicator attributes={span.attributes} />
          <ToolList tools={tools} />
          <SpanStatsShields span={span} className="w-fit" />
          <div className="flex h-6 w-fit items-center rounded-md bg-surface-up-2 px-2">
            <ClientTimestampFormatter
              absolute
              seconds
              timestamp={span.startTime}
              className="text-xs text-secondary-foreground"
            />
          </div>
          <StructuredOutputSchema schema={schema} />
          {!isShared && <SpanTagsList traceId={span.traceId} spanId={span.spanId} />}
        </div>

        {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
      </div>
      {children}
    </div>
  );
}
