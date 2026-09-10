import { X } from "lucide-react";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useMemo } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTagsList from "@/components/tags/span-tags-list";
import ErrorCard from "@/components/traces/error-card";
import SpanActionsDropdown from "@/components/traces/span-actions-dropdown";
import { Button } from "@/components/ui/button";
import { type Span } from "@/lib/traces/types";
import { type ErrorEventAttributes } from "@/lib/types";

import { ModelIndicator } from "./model-indicator";
import SpanTypeIcon from "./span-type-icon";
import SpanStatsShields from "./stats-shields";
import { StructuredOutputSchema } from "./structured-output-schema";
import { resolveTools, ToolList } from "./tool-list";

interface SpanControlsProps {
  span: Span;
  onClose?: () => void;
  isAlwaysSelectSpan?: boolean;
}

export function SpanControls({ children, span, onClose, isAlwaysSelectSpan }: PropsWithChildren<SpanControlsProps>) {
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
        <div className="flex flex-none items-center gap-2">
          <SpanTypeIcon spanType={span.spanType} />
          <div className="min-w-0 flex-1">
            <SpanActionsDropdown projectId={projectId as string} span={span} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {!isAlwaysSelectSpan && onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="flex-shrink-0 hover:bg-surface-up"
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
          <SpanStatsShields span={span} className="w-fit" />
          <div className="flex h-[26px] w-fit items-center rounded-md bg-surface-up-2 px-2">
            <ClientTimestampFormatter
              absolute
              timestamp={span.startTime}
              className="text-xs text-secondary-foreground"
            />
          </div>
          <ToolList tools={tools} />
          <StructuredOutputSchema schema={schema} />
          <SpanTagsList traceId={span.traceId} spanId={span.spanId} />
        </div>

        {errorEventAttributes && <ErrorCard attributes={errorEventAttributes} />}
      </div>
      {children}
    </div>
  );
}
