/**
 * Session-view versions of transcript item components.
 *
 * The upstream transcript components (AgentGroupHeader, SpanItem, InputItem)
 * read from `useTraceViewBaseStore` which requires a TraceViewContext provider.
 * Session-view has its own store, so we provide lightweight wrappers that
 * replicate the visual output without the store dependency.
 *
 * FLAG: These duplicate rendering logic from the upstream transcript items.
 * If the upstream components are refactored to accept store values via props
 * instead of reading from context, these wrappers can be replaced with direct
 * imports. Until then, visual drift between trace-view and session-view
 * transcript rendering is possible.
 */
import { Bot, ChevronRight, LogIn } from "lucide-react";
import { useCallback, useMemo } from "react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewListSpan, type TranscriptListGroup } from "@/components/traces/trace-view/store/base";
import { CollapsedTextWithMore } from "@/components/traces/trace-view/transcript/collapsed-text-with-more";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------- Input Item ----------

interface SessionInputItemProps {
  text: string | null;
  isLoading: boolean;
}

export function SessionInputItem({ text, isLoading }: SessionInputItemProps) {
  if (!isLoading && !text) return null;

  return (
    <div className="flex flex-col flex-1 min-w-0 px-3 py-2 border-l-4 border-l-transparent gap-1">
      <div className="flex gap-2 items-center min-w-0">
        <div className="flex items-center justify-center z-10 rounded shrink-0 bg-blue-400/70 w-5 h-5 min-w-5 min-h-5">
          <LogIn size={14} />
        </div>
        <span className="font-medium text-sm whitespace-nowrap shrink-0">Input</span>
      </div>
      <div className="pl-7">
        {isLoading ? <PreviewLoadingPlaceholder /> : <CollapsedTextWithMore text={text!} lineHeight={17} />}
      </div>
    </div>
  );
}

// ---------- Span Item ----------

interface SessionSpanItemProps {
  span: TraceViewListSpan;
  output: any | undefined;
  onSpanSelect: (span: TraceViewListSpan) => void;
  isSelected: boolean;
  inGroup?: boolean;
}

export function SessionSpanItem({ span, output, onSpanSelect, isSelected, inGroup = false }: SessionSpanItemProps) {
  const isLLMType = span.spanType === "LLM" || span.spanType === "CACHED";
  const isPending = span.pending;
  const isLoadingOutput = output === undefined;
  const previewText = typeof output === "string" && output !== "" ? output : null;
  const showInlinePreview = !isLLMType && !isPending;

  return (
    <div
      className={cn(
        "flex group/message cursor-pointer transition-all border-l-4",
        inGroup ? "hover:bg-muted/80 bg-muted/60" : "hover:bg-secondary",
        isSelected ? "bg-primary/5 border-l-primary" : "border-l-transparent"
      )}
      onClick={() => {
        if (!isPending) {
          onSpanSelect(span);
        }
      }}
    >
      <div className="flex flex-col flex-1 min-w-0 px-3 py-2 gap-1">
        <div className="flex gap-2 items-center min-w-0">
          <SpanTypeIcon
            spanType={span.spanType}
            containerWidth={20}
            containerHeight={20}
            size={14}
            className={cn("shrink-0", { "text-muted-foreground bg-muted": isPending })}
          />

          {showInlinePreview ? (
            <div className="flex gap-2 items-center min-w-0 overflow-hidden">
              <span className="font-medium text-[13px] whitespace-nowrap shrink-0">{getSpanDisplayName(span)}</span>
              {previewText ? (
                <span className="text-[13px] text-secondary-foreground truncate min-w-0">{previewText}</span>
              ) : isLoadingOutput ? (
                <Skeleton className="h-4 min-w-0 w-full max-w-[200px]" />
              ) : null}
            </div>
          ) : (
            <span
              className={cn(
                "font-medium text-[13px] whitespace-nowrap truncate",
                isPending && "text-muted-foreground shimmer"
              )}
            >
              {getSpanDisplayName(span)}
            </span>
          )}

          <div className="flex items-center shrink-0 ml-auto">
            {isPending ? (
              <Skeleton className="w-10 h-4 bg-secondary rounded-md" />
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

        {isLLMType && !isPending && previewText && (
          <div className="pl-7">
            <CollapsedTextWithMore text={previewText} lineHeight={17} />
          </div>
        )}
        {isLLMType && !isPending && !previewText && isLoadingOutput && (
          <div className="pl-7">
            <PreviewLoadingPlaceholder />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Agent Group Header ----------

type PreviewMap = Record<string, string | null | undefined>;

interface SessionAgentGroupHeaderProps {
  group: TranscriptListGroup;
  collapsed: boolean;
  previews: PreviewMap;
  inputPreviews: PreviewMap;
  onToggle: () => void;
}

export function SessionAgentGroupHeader({
  group,
  collapsed,
  previews,
  inputPreviews,
  onToggle,
}: SessionAgentGroupHeaderProps) {
  const handleToggle = useCallback(() => onToggle(), [onToggle]);

  const { inputPreview, outputPreview } = useMemo(() => {
    let input: string | null | undefined;
    if (collapsed && group.firstLlmSpanId) {
      input = inputPreviews[group.firstLlmSpanId];
    }
    let output: string | null | undefined;
    if (collapsed && group.lastLlmSpanId) {
      output = previews[group.lastLlmSpanId];
    }
    return { inputPreview: input, outputPreview: output };
  }, [collapsed, group, previews, inputPreviews]);

  const isLoadingInput = inputPreview === undefined;
  const inputText = typeof inputPreview === "string" && inputPreview !== "" ? inputPreview : null;
  const isLoadingOutput = outputPreview === undefined;
  const outputText = typeof outputPreview === "string" && outputPreview !== "" ? outputPreview : null;

  return (
    <div
      className={cn(
        "mx-2 border bg-muted/80 overflow-hidden cursor-pointer transition-colors hover:bg-muted",
        collapsed ? "rounded-lg" : "rounded-t-lg"
      )}
      onClick={handleToggle}
    >
      <div className={cn("flex flex-col flex-1 min-w-0 px-3 py-2", collapsed && "gap-1")}>
        <div className="flex gap-2 items-center min-w-0">
          <div
            className="flex items-center justify-center z-10 rounded shrink-0"
            style={{
              backgroundColor: "rgba(6, 182, 212, 0.7)",
              minWidth: 20,
              minHeight: 20,
              width: 20,
              height: 20,
            }}
          >
            <Bot size={14} />
          </div>
          <span className="font-medium text-[13px] whitespace-nowrap truncate">{group.name}</span>
          <div className="flex items-center shrink-0 ml-auto gap-2">
            <SpanStatsShield
              variant="inline"
              startTime={group.startTime}
              endTime={group.endTime}
              inputTokens={group.inputTokens}
              outputTokens={group.outputTokens}
              cost={group.totalCost}
              cacheReadInputTokens={group.cacheReadInputTokens}
            />
            <ChevronRight
              size={14}
              className={cn("shrink-0 text-secondary-foreground transition-transform", !collapsed && "rotate-90")}
            />
          </div>
        </div>

        {collapsed && (
          <CollapsedPreviewBlock
            text={inputText}
            isLoading={isLoadingInput}
            label={group.lastLlmSpanId ? "Input" : undefined}
            variant="collapsed"
          />
        )}

        {collapsed && group.lastLlmSpanId && (
          <CollapsedPreviewBlock text={outputText} isLoading={isLoadingOutput} label="Output" variant="collapsed" />
        )}
      </div>
    </div>
  );
}

// Inlined from shared.tsx to avoid the transitive store dependency
function CollapsedPreviewBlock({
  text,
  isLoading,
  label,
  variant = "text",
}: {
  text: string | null;
  isLoading: boolean;
  label?: string;
  variant?: "text" | "collapsed";
}) {
  if (text) {
    if (variant === "collapsed") {
      return (
        <div className="flex flex-col min-w-0 pl-7 animate-in fade-in duration-150">
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
          <CollapsedTextWithMore text={text} lineHeight={17} maxLines={2} />
        </div>
      );
    }
    return (
      <span className="text-[13px] text-secondary-foreground truncate min-w-0 pl-7 animate-in fade-in duration-150">
        {text}
      </span>
    );
  }

  if (isLoading) {
    if (variant === "collapsed") {
      return (
        <div className="pl-7">
          <PreviewLoadingPlaceholder />
        </div>
      );
    }
    return <Skeleton className="h-4 min-w-0 w-full bg-secondary ml-7 animate-in fade-in duration-150" />;
  }

  return null;
}
