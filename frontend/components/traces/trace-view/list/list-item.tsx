import { isEmpty, isNil } from "lodash";
import { ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useOptionalDebuggerStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import { SnippetPreview } from "@/components/traces/snippet-preview";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { ContentPreview } from "@/components/traces/trace-view/content-preview";
import { DebuggerCheckpoint } from "@/components/traces/trace-view/debugger-checkpoint.tsx";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder";
import { SpanDisplayTooltip } from "@/components/traces/trace-view/span-display-tooltip.tsx";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewListSpan, useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
import { Button } from "@/components/ui/button";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

interface ListItemProps {
  span: TraceViewListSpan;
  output: any | undefined;
  onSpanSelect: (span: TraceViewListSpan) => void;
}

const ListItem = ({ span, output, onSpanSelect }: ListItemProps) => {
  const { selectedSpan, spans } = useTraceViewBaseStore((state) => ({
    selectedSpan: state.selectedSpan,
    spans: state.spans,
  }));

  const {
    enabled: cachingEnabled,
    state: { isSpanCached },
  } = useOptionalDebuggerStore((s) => ({
    isSpanCached: s.isSpanCached,
  }));

  const fullSpan = useMemo(() => spans.find((s) => s.spanId === span.spanId), [spans, span.spanId]);
  const isCached = cachingEnabled && fullSpan ? isSpanCached(fullSpan) : false;

  const hasSnippet = !!(span.inputSnippet || span.outputSnippet);
  const isExpandableType =
    span.spanType === "LLM" ||
    span.spanType === "CACHED" ||
    span.spanType === "EXECUTOR" ||
    span.spanType === "EVALUATOR" ||
    span.spanType === "TOOL" ||
    hasSnippet;

  const isPending = span.pending;
  const isLoadingOutput = output === undefined;

  const defaultExpanded = isExpandableType && (isLoadingOutput || !isEmpty(output));

  const [expandOverride, setExpandOverride] = useState<{ spanId: string; expanded: boolean } | null>(null);

  const isExpanded = expandOverride?.spanId === span.spanId ? expandOverride.expanded : defaultExpanded;

  const isSelected = selectedSpan?.spanId === span.spanId;

  const outerClasses = cn(
    "flex flex-row group/message cursor-pointer transition-all border-l-4",
    "hover:bg-secondary",
    isSelected ? "bg-primary/5 border-l-primary" : "border-l-transparent",
    { "opacity-60": isCached }
  );

  const lockColumnClasses = cn("flex items-start justify-center shrink-0 w-10 p-1 self-stretch pt-2.5");

  return (
    <div
      className={outerClasses}
      onClick={() => {
        if (!isPending) {
          onSpanSelect(span);
        }
      }}
    >
      {cachingEnabled && <div className={lockColumnClasses}>{fullSpan && <DebuggerCheckpoint span={fullSpan} />}</div>}

      <div className={cn("flex flex-col flex-1 min-w-0 py-1")}>
        <div className="flex items-center gap-2 pl-2 pr-3 py-2">
          <div className="flex items-center gap-2 flex-1 justify-between overflow-hidden">
            <div className="flex items-center gap-2 min-w-0 flex-shrink-[2]">
              <SpanTypeIcon spanType={span.spanType} className={cn({ "text-muted-foreground bg-muted": isPending })} />
              <SpanDisplayTooltip isLLM={span.spanType === "LLM"} name={span.name}>
                <span
                  className={cn("font-medium text-sm truncate min-w-0", isPending && "text-muted-foreground shimmer")}
                >
                  {getSpanDisplayName(span)}
                </span>
              </SpanDisplayTooltip>

              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandOverride({ spanId: span.spanId, expanded: !isExpanded });
                }}
                className="h-5 py-0 px-0.5 hover:bg-muted rounded transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "size-4 text-secondary-foreground transition-transform ease-in-out",
                    !isExpanded && "-rotate-90"
                  )}
                />
              </Button>
            </div>

            <div className="flex items-center gap-2 min-w-0 ml-auto">
              {isPending ? (
                isStringDateOld(span.startTime) ? (
                  <NoSpanTooltip>
                    <div className="flex rounded bg-secondary p-1">
                      <X className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  </NoSpanTooltip>
                ) : (
                  <PreviewLoadingPlaceholder compact />
                )
              ) : (
                <SpanStatsShield
                  className="hidden group-hover/message:flex"
                  startTime={span.startTime}
                  endTime={span.endTime}
                  tokens={span.totalTokens}
                  cost={span.totalCost}
                  cacheReadInputTokens={span.cacheReadInputTokens}
                />
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="px-3 w-full p-2 pt-0 flex flex-col gap-2 h-full flex-1">
            {hasSnippet ? (
              <SnippetPreview inputSnippet={span.inputSnippet} outputSnippet={span.outputSnippet} variant="span" />
            ) : isLoadingOutput ? (
              <>
                <PreviewLoadingPlaceholder />
              </>
            ) : isNil(output) || output === "" ? (
              <div className="text-sm text-muted-foreground italic">No output available</div>
            ) : (
              <ContentPreview output={output} maxHeight="max-h-60" expandable />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ListItem;
