import { Bot, ChevronRight } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TranscriptListGroup, useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import {
  CollapsedPreviewBlock,
  type PreviewMap,
} from "@/components/traces/trace-view/transcript/item/collapsed-preview-block";
import { cn } from "@/lib/utils";

interface AgentGroupHeaderProps {
  group: TranscriptListGroup;
  collapsed: boolean;
  previews: PreviewMap;
  inputPreviews: PreviewMap;
  agentNames: Record<string, string | null | undefined>;
}

export function AgentGroupHeader({ group, collapsed, previews, inputPreviews, agentNames }: AgentGroupHeaderProps) {
  const toggleTranscriptGroup = useTraceViewBaseStore((s) => s.toggleTranscriptGroup);

  const handleToggle = useCallback(() => {
    toggleTranscriptGroup(group.groupId);
  }, [toggleTranscriptGroup, group.groupId]);

  // When a group has only one LLM span, store/utils sets `lastLlmSpanId` to
  // null to avoid duplicating the same id. In that case, the collapsed header
  // still needs an output preview — fall back to the first (= only) LLM span.
  const outputSpanId = group.lastLlmSpanId ?? group.firstLlmSpanId;

  const { preview, outputPreview, agentName } = useMemo(() => {
    const name = group.firstLlmSpanId ? agentNames[group.firstLlmSpanId] : undefined;

    let inputPreview: string | null | undefined;
    if (collapsed && group.firstLlmSpanId) {
      inputPreview = inputPreviews[group.firstLlmSpanId];
    }

    let output: string | null | undefined;
    if (collapsed && outputSpanId) {
      output = previews[outputSpanId];
    }

    return { preview: inputPreview, outputPreview: output, agentName: name };
  }, [collapsed, group.firstLlmSpanId, outputSpanId, previews, inputPreviews, agentNames]);

  const isLoadingPreview = preview === undefined;
  const previewText = typeof preview === "string" && preview !== "" ? preview : null;
  const displayName = agentName || group.name;

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
      <div className={cn("flex flex-col flex-1 min-w-0 px-2 py-2", collapsed && "gap-1")}>
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
            <ChevronRight
              size={14}
              className={cn("shrink-0 text-secondary-foreground transition-transform", !collapsed && "rotate-90")}
            />
          </div>
        </div>

        {collapsed && (
          <CollapsedPreviewBlock
            text={previewText}
            isLoading={isLoadingPreview}
            label={outputSpanId ? "Input" : undefined}
            variant="collapsed"
          />
        )}

        {collapsed && outputSpanId && (
          <CollapsedPreviewBlock text={outputText} isLoading={isLoadingOutput} label="Output" variant="collapsed" />
        )}
      </div>
    </div>
  );
}

export function GroupChildWrapper({ isLast = false, children }: { isLast?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn("mx-2 border-x transition-colors", {
        "border-b rounded-b-lg overflow-hidden": isLast,
      })}
    >
      {children}
    </div>
  );
}
