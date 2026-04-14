import { Bot, ChevronRight } from "lucide-react";
import { useCallback } from "react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder.tsx";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import {
  type TraceViewListSpan,
  type TranscriptListGroup,
  useTraceViewBaseStore,
} from "@/components/traces/trace-view/store/base";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { CollapsedTextWithMore } from "./collapsed-text-with-more";

interface AgentGroupHeaderProps {
  group: TranscriptListGroup;
  collapsed: boolean;
  preview: string | null | undefined;
  agentName?: string | null;
  onSpanSelect: (span: TraceViewListSpan) => void;
}

export function AgentGroupHeader({ group, collapsed, preview, agentName, onSpanSelect }: AgentGroupHeaderProps) {
  const toggleTranscriptGroup = useTraceViewBaseStore((s) => s.toggleTranscriptGroup);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTranscriptGroup(group.groupId);
    },
    [toggleTranscriptGroup, group.groupId]
  );

  const firstSpan = group.spans[0];
  if (!firstSpan) return null;

  const isSubagent = group.isSubagent;
  const isLLMType = firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED";
  const showPreviewBelow = isSubagent || isLLMType;
  const isLoadingPreview = preview === undefined;
  const previewText = typeof preview === "string" && preview !== "" ? preview : null;

  const displayName = isSubagent ? agentName || group.name : agentName || getSpanDisplayName(firstSpan);

  return (
    <div
      className={cn(
        "mx-2 mt-1 border bg-muted/90 overflow-hidden cursor-pointer transition-colors hover:bg-muted-foreground/10",
        collapsed ? "rounded-lg border" : "rounded-t-lg"
      )}
      onClick={isSubagent ? handleToggle : () => onSpanSelect(firstSpan)}
    >
      <div className="flex gap-2 items-start flex-1 min-w-0 px-3 py-2">
        {isSubagent ? (
          <div
            className="flex items-center justify-center z-10 rounded shrink-0"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.7)",
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
        <div className={cn("flex flex-col flex-1 min-w-0", showPreviewBelow && "gap-0.5")}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[13px] whitespace-nowrap truncate">{displayName}</span>
            {!showPreviewBelow &&
              (previewText ? (
                <span className="text-[13px] text-secondary-foreground truncate min-w-0 flex-1">{previewText}</span>
              ) : isLoadingPreview ? (
                <Skeleton className="h-4 flex-1 min-w-0 max-w-[200px] bg-secondary" />
              ) : null)}
            <div className="flex items-center shrink-0 ml-auto gap-1">
              <SpanStatsShield
                variant="inline"
                startTime={group.startTime}
                endTime={group.endTime}
                tokens={group.totalTokens}
                cost={group.totalCost}
              />
              <button onClick={handleToggle} className="p-0.5 rounded hover:bg-muted-foreground/20 transition-colors">
                <ChevronRight
                  size={16}
                  className={cn("shrink-0 text-secondary-foreground transition-transform", !collapsed && "rotate-90")}
                />
              </button>
            </div>
          </div>
          {showPreviewBelow &&
            (previewText ? (
              <CollapsedTextWithMore text={previewText} lineHeight={17} maxLines={2} />
            ) : isLoadingPreview ? (
              <PreviewLoadingPlaceholder />
            ) : null)}
        </div>
      </div>
    </div>
  );
}
