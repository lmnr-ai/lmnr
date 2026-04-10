import { X } from "lucide-react";
import { useMemo } from "react";

import { useOptionalDebuggerStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import { SnippetPreview } from "@/components/traces/snippet-preview";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { DebuggerCheckpoint } from "@/components/traces/trace-view/debugger-checkpoint.tsx";
import { CollapsedTextWithMore } from "@/components/traces/trace-view/list/collapsed-text-with-more";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder";
import { SpanDisplayTooltip } from "@/components/traces/trace-view/span-display-tooltip.tsx";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewListSpan, useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
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

  const hasSnippet = !!(span.inputSnippet || span.outputSnippet || span.attributesSnippet);
  const isLLMType = span.spanType === "LLM" || span.spanType === "CACHED";
  const isPending = span.pending;
  const previewText = typeof output === "string" && output !== "" ? output : null;
  const isSelected = selectedSpan?.spanId === span.spanId;

  return (
    <div
      className={cn(
        "flex group/message cursor-pointer transition-all border-l-4",
        "hover:bg-secondary",
        isSelected ? "bg-primary/5 border-l-primary" : "border-l-transparent",
        { "opacity-60": isCached }
      )}
      onClick={() => {
        if (!isPending) {
          onSpanSelect(span);
        }
      }}
    >
      {cachingEnabled && (
        <div className="flex items-start justify-center shrink-0 w-10 p-1 self-stretch pt-2.5">
          {fullSpan && <DebuggerCheckpoint span={fullSpan} />}
        </div>
      )}

      <div className="flex gap-2 items-start flex-1 min-w-0 px-3 py-2">
        <SpanTypeIcon
          spanType={span.spanType}
          containerWidth={20}
          containerHeight={20}
          size={14}
          className={cn("shrink-0", { "text-muted-foreground bg-muted": isPending })}
        />
        <div className={cn("flex flex-col flex-1 min-w-0", isLLMType && "gap-0.5")}>
          <div className="flex items-center gap-2 min-w-0">
            <SpanDisplayTooltip isLLM={isLLMType} name={span.name}>
              <span
                className={cn(
                  "font-medium text-[13px] whitespace-nowrap shrink-0",
                  isPending && "text-muted-foreground shimmer"
                )}
              >
                {getSpanDisplayName(span)}
              </span>
            </SpanDisplayTooltip>

            {!isLLMType &&
              (hasSnippet ? (
                <div className="min-w-0 flex-1 overflow-hidden">
                  <SnippetPreview
                    inputSnippet={span.inputSnippet}
                    outputSnippet={span.outputSnippet}
                    attributesSnippet={span.attributesSnippet}
                    variant="span"
                    className="truncate"
                  />
                </div>
              ) : previewText ? (
                <span className="text-[13px] text-secondary-foreground truncate min-w-0 flex-1">{previewText}</span>
              ) : null)}

            <div className="flex items-center shrink-0 ml-auto">
              {isPending ? (
                isStringDateOld(span.startTime) ? (
                  <NoSpanTooltip>
                    <div className="flex rounded bg-secondary p-1">
                      <X className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  </NoSpanTooltip>
                ) : (
                  <PreviewLoadingPlaceholder />
                )
              ) : (
                <SpanStatsShield
                  variant="inline"
                  startTime={span.startTime}
                  endTime={span.endTime}
                  tokens={span.totalTokens}
                  cost={span.totalCost}
                  cacheReadInputTokens={span.cacheReadInputTokens}
                />
              )}
            </div>
          </div>

          {isLLMType && !isPending && previewText && <CollapsedTextWithMore text={previewText} lineHeight={17} />}
        </div>
      </div>
    </div>
  );
};

export default ListItem;
