import { Bot, ChevronRight, X } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import { useOptionalDebuggerStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import { SnippetPreview } from "@/components/traces/snippet-preview";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { DebuggerCheckpoint } from "@/components/traces/trace-view/debugger-checkpoint.tsx";
import { CollapsedTextWithMore } from "@/components/traces/trace-view/list/collapsed-text-with-more";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder.tsx";
import { SpanDisplayTooltip } from "@/components/traces/trace-view/span-display-tooltip.tsx";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import {
  type TraceViewListSpan,
  type TranscriptListGroup,
  useTraceViewBaseStore,
} from "@/components/traces/trace-view/store/base";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
import { Skeleton } from "@/components/ui/skeleton";
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
  const isLoadingOutput = output === undefined;
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

      <div className="flex flex-col flex-1 min-w-0 px-3 py-2 gap-1">
        <div className="flex gap-2 items-center min-w-0">
          <SpanTypeIcon
            spanType={span.spanType}
            containerWidth={20}
            containerHeight={20}
            size={14}
            className={cn("shrink-0", { "text-muted-foreground bg-muted": isPending })}
          />
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

          <div className="flex items-center shrink-0 ml-auto">
            {isPending ? (
              isStringDateOld(span.startTime) ? (
                <NoSpanTooltip>
                  <div className="flex rounded bg-secondary p-1">
                    <X className="w-4 h-4 text-secondary-foreground" />
                  </div>
                </NoSpanTooltip>
              ) : (
                <Skeleton className="w-10 h-4 bg-secondary rounded-md" />
              )
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

        {!isLLMType &&
          !isPending &&
          (hasSnippet ? (
            <div className="min-w-0 overflow-hidden pl-7">
              <SnippetPreview
                inputSnippet={span.inputSnippet}
                outputSnippet={span.outputSnippet}
                attributesSnippet={span.attributesSnippet}
                variant="span"
                className="truncate"
              />
            </div>
          ) : previewText ? (
            <span className="text-sm text-secondary-foreground truncate min-w-0 pl-7">{previewText}</span>
          ) : isLoadingOutput ? (
            <Skeleton className="h-4 min-w-0 w-full max-w-[300px] ml-7" />
          ) : null)}

        {isLLMType &&
          !isPending &&
          (previewText ? (
            <div className="pl-7">
              <CollapsedTextWithMore text={previewText} lineHeight={17} />
            </div>
          ) : isLoadingOutput ? (
            <div className="pl-7">
              <PreviewLoadingPlaceholder />
            </div>
          ) : null)}
      </div>
    </div>
  );
};

export default ListItem;

type PreviewMap = Record<string, string | null | undefined>;

interface AgentGroupHeaderProps {
  group: TranscriptListGroup;
  collapsed: boolean;
  previews: PreviewMap;
  inputPreviews: PreviewMap;
  agentNames: Record<string, string | null | undefined>;
  onSpanSelect: (span: TraceViewListSpan) => void;
}

export function AgentGroupHeader({
  group,
  collapsed,
  previews,
  inputPreviews,
  agentNames,
  onSpanSelect,
}: AgentGroupHeaderProps) {
  const toggleTranscriptGroup = useTraceViewBaseStore((s) => s.toggleTranscriptGroup);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTranscriptGroup(group.groupId);
    },
    [toggleTranscriptGroup, group.groupId]
  );

  const { firstSpan } = group;

  const { preview, outputPreview, agentName } = useMemo(() => {
    const name = group.firstLlmSpanId ? agentNames[group.firstLlmSpanId] : undefined;

    let inputPreview: string | null | undefined;
    if (collapsed) {
      const isLlm = firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED";
      if (group.isSubagent && group.firstLlmSpanId) {
        inputPreview = inputPreviews[group.firstLlmSpanId];
      } else {
        const previewSpanId = isLlm && group.firstLlmSpanId ? group.firstLlmSpanId : firstSpan.spanId;
        inputPreview = previews[previewSpanId];
      }
    }

    let output: string | null | undefined;
    if (collapsed && group.lastLlmSpanId) {
      output = previews[group.lastLlmSpanId];
    }

    return { preview: inputPreview, outputPreview: output, agentName: name };
  }, [collapsed, firstSpan, group, previews, inputPreviews, agentNames]);

  const isSubagent = group.isSubagent;
  const isLLMType = firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED";
  const showPreviewBelow = collapsed && (isSubagent || isLLMType);
  const isLoadingPreview = preview === undefined;
  const previewText = typeof preview === "string" && preview !== "" ? preview : null;
  const displayName = isSubagent ? agentName || group.name : agentName || getSpanDisplayName(firstSpan);

  return (
    <div
      className={cn(
        "mx-2 border bg-muted/90 overflow-hidden cursor-pointer transition-colors hover:bg-muted-foreground/10",
        collapsed ? "rounded-lg" : "rounded-t-lg"
      )}
      onClick={isSubagent ? handleToggle : () => onSpanSelect(firstSpan)}
    >
      <div className={cn("flex flex-col flex-1 min-w-0 px-3 py-2", showPreviewBelow && "gap-1")}>
        <div className="flex gap-2 items-center min-w-0">
          {isSubagent ? (
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
          ) : (
            <SpanTypeIcon
              spanType={firstSpan.spanType}
              containerWidth={20}
              containerHeight={20}
              size={14}
              className="shrink-0"
            />
          )}
          <span className="font-medium text-[13px] whitespace-nowrap truncate">{displayName}</span>
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
            <button onClick={handleToggle} className="flex items-center p-0 rounded transition-colors">
              <ChevronRight
                size={14}
                className={cn("shrink-0 text-secondary-foreground transition-transform", !collapsed && "rotate-90")}
              />
            </button>
          </div>
        </div>
        {collapsed &&
          !showPreviewBelow &&
          (previewText ? (
            <span className="text-[13px] text-secondary-foreground truncate min-w-0 pl-7 animate-in fade-in duration-150">
              {previewText}
            </span>
          ) : isLoadingPreview ? (
            <Skeleton className="h-4 min-w-0 max-w-[200px] bg-secondary ml-7 animate-in fade-in duration-150" />
          ) : null)}
        {showPreviewBelow &&
          (previewText ? (
            <div className="flex flex-col min-w-0 pl-7 animate-in fade-in duration-150">
              {group.lastLlmSpanId && <span className="text-xs text-muted-foreground">Input</span>}
              <CollapsedTextWithMore text={previewText} lineHeight={17} maxLines={2} />
            </div>
          ) : isLoadingPreview ? (
            <div className="pl-7">
              <PreviewLoadingPlaceholder />
            </div>
          ) : null)}
        {showPreviewBelow &&
          group.lastLlmSpanId &&
          (outputPreview ? (
            <div className="flex flex-col min-w-0 pl-7 animate-in fade-in duration-150">
              <span className="text-xs text-muted-foreground">Output</span>
              <CollapsedTextWithMore text={outputPreview} lineHeight={17} maxLines={2} />
            </div>
          ) : outputPreview === undefined ? (
            <div className="pl-7">
              <PreviewLoadingPlaceholder />
            </div>
          ) : null)}
      </div>
    </div>
  );
}

export function GroupChildWrapper({ isLast = false, children }: { isLast?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn("mx-2 border-x bg-muted/40", {
        "border-b rounded-b-lg overflow-hidden": isLast,
      })}
    >
      {children}
    </div>
  );
}
