import { X } from "lucide-react";

import { useOptionalDebuggerStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import { SnippetPreview } from "@/components/traces/snippet-preview";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { DebuggerCheckpoint } from "@/components/traces/trace-view/debugger-checkpoint.tsx";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder.tsx";
import { SpanDisplayTooltip } from "@/components/traces/trace-view/span-display-tooltip.tsx";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewListSpan, type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { CollapsedTextWithMore } from "@/components/traces/trace-view/transcript/collapsed-text-with-more";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
import { Skeleton } from "@/components/ui/skeleton";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

function InlinePreviewContent({
  span,
  previewText,
  isLoading,
}: {
  span: TraceViewListSpan;
  previewText: string | null;
  isLoading: boolean;
}) {
  const hasSnippet = !!(span.inputSnippet || span.outputSnippet || span.attributesSnippet);

  if (hasSnippet) {
    return (
      <div className="min-w-0 overflow-hidden">
        <SnippetPreview
          inputSnippet={span.inputSnippet}
          outputSnippet={span.outputSnippet}
          attributesSnippet={span.attributesSnippet}
          variant="span"
          className="truncate"
        />
      </div>
    );
  }

  if (previewText) {
    return <span className="text-[13px] text-secondary-foreground truncate min-w-0">{previewText}</span>;
  }

  if (isLoading) {
    return <Skeleton className="h-4 min-w-0 w-full max-w-[200px]" />;
  }

  return null;
}

function PendingIndicator({ startTime }: { startTime: string }) {
  if (isStringDateOld(startTime)) {
    return (
      <NoSpanTooltip>
        <div className="flex rounded bg-secondary p-1">
          <X className="w-4 h-4 text-secondary-foreground" />
        </div>
      </NoSpanTooltip>
    );
  }

  return <Skeleton className="w-10 h-4 bg-secondary rounded-md" />;
}

function LLMOutputPreview({ previewText, isLoading }: { previewText: string | null; isLoading: boolean }) {
  if (previewText) {
    return (
      <div className="pl-7">
        <CollapsedTextWithMore text={previewText} lineHeight={17} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pl-7">
        <PreviewLoadingPlaceholder />
      </div>
    );
  }

  return null;
}

export interface SpanItemProps {
  span: TraceViewListSpan;
  /** Full span data — only needed for debugger features (checkpoint, cache).
   *  When omitted, the row renders normally but without debugger UI. */
  fullSpan?: TraceViewSpan;
  output: any | undefined;
  onSpanSelect: (span: TraceViewListSpan) => void;
  isSelected: boolean;
  inGroup?: boolean;
}

export default function SpanItem({ span, fullSpan, output, onSpanSelect, isSelected, inGroup = false }: SpanItemProps) {
  const {
    enabled: cachingEnabled,
    state: { isSpanCached },
  } = useOptionalDebuggerStore((s) => ({
    isSpanCached: s.isSpanCached,
  }));

  const isCached = cachingEnabled && fullSpan ? isSpanCached(fullSpan) : false;

  const isLLMType = span.spanType === "LLM" || span.spanType === "CACHED";
  const isPending = span.pending;
  const isLoadingOutput = output === undefined;
  const previewText = typeof output === "string" && output !== "" ? output : null;
  const showInlinePreview = !isLLMType && !isPending;

  return (
    <div
      className={cn(
        "flex group/message cursor-pointer transition-all border-l-2",
        inGroup ? "hover:bg-muted/80 bg-muted/60" : "hover:bg-secondary",
        isSelected ? "bg-primary/15 border-l-primary hover:bg-primary/20" : "border-l-transparent",
        { "opacity-60": isCached }
      )}
      onClick={() => {
        if (!isPending) {
          onSpanSelect(span);
        }
      }}
    >
      {cachingEnabled && fullSpan && (
        <div className="flex items-start justify-center shrink-0 w-10 p-1 self-stretch pt-2.5">
          <DebuggerCheckpoint span={fullSpan} />
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 py-2 gap-1 pl-1.5 pr-2">
        <div className="flex gap-2 items-center min-w-0">
          <SpanTypeIcon
            spanType={span.spanType}
            containerWidth={20}
            containerHeight={20}
            size={14}
            className={cn("shrink-0", { "text-muted-foreground bg-muted": isPending })}
          />

          {showInlinePreview ? (
            <div className="flex flex-1 gap-2 items-center min-w-0">
              <SpanDisplayTooltip isLLM={isLLMType} name={span.name}>
                <span className="font-medium text-[13px] whitespace-nowrap shrink-0">{getSpanDisplayName(span)}</span>
              </SpanDisplayTooltip>
              <InlinePreviewContent span={span} previewText={previewText} isLoading={isLoadingOutput} />
            </div>
          ) : (
            <SpanDisplayTooltip isLLM={isLLMType} name={span.name}>
              <span
                className={cn(
                  "font-medium text-[13px] whitespace-nowrap truncate",
                  isPending && "text-muted-foreground shimmer"
                )}
              >
                {getSpanDisplayName(span)}
              </span>
            </SpanDisplayTooltip>
          )}

          <div className="flex items-center shrink-0 ml-auto">
            {isPending ? (
              <PendingIndicator startTime={span.startTime} />
            ) : (
              <SpanStatsShield
                variant="inline"
                startTime={span.startTime}
                endTime={span.endTime}
                inputTokens={span.inputTokens}
                outputTokens={span.outputTokens}
                cost={span.totalCost}
                cacheReadInputTokens={span.cacheReadInputTokens}
              />
            )}
          </div>
        </div>

        {isLLMType && !isPending && <LLMOutputPreview previewText={previewText} isLoading={isLoadingOutput} />}
      </div>
    </div>
  );
}
