import { ChevronRight } from "lucide-react";
import { useCallback } from "react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import {
  type ReaderListGroup,
  type TraceViewListSpan,
  useTraceViewBaseStore,
} from "@/components/traces/trace-view/store/base";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils";
import { cn } from "@/lib/utils";

import { CollapsedTextWithMore } from "./collapsed-text-with-more";

interface AgentGroupHeaderProps {
  group: ReaderListGroup;
  collapsed: boolean;
  preview: string | null | undefined;
  onSpanSelect: (span: TraceViewListSpan) => void;
}

export function AgentGroupHeader({ group, collapsed, preview, onSpanSelect }: AgentGroupHeaderProps) {
  const toggleReaderGroup = useTraceViewBaseStore((s) => s.toggleReaderGroup);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleReaderGroup(group.groupId);
    },
    [toggleReaderGroup, group.groupId]
  );

  const firstSpan = group.spans[0];
  if (!firstSpan) return null;

  const isLLMType = firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED";
  const previewText = typeof preview === "string" && preview !== "" ? preview : null;

  return (
    <div
      className={cn(
        "mx-2 mt-1 border bg-muted overflow-hidden cursor-pointer transition-colors hover:bg-muted-foreground/10",
        collapsed ? "rounded-lg" : "rounded-t-lg border-b-0"
      )}
      onClick={() => onSpanSelect(firstSpan)}
    >
      <div className="flex gap-2 items-start flex-1 min-w-0 px-3 py-2">
        <SpanTypeIcon
          spanType={firstSpan.spanType}
          containerWidth={20}
          containerHeight={20}
          size={14}
          className="shrink-0"
        />
        <div className={cn("flex flex-col flex-1 min-w-0", isLLMType && "gap-0.5")}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[13px] whitespace-nowrap shrink-0">{getSpanDisplayName(firstSpan)}</span>
            {!isLLMType && previewText && (
              <span className="text-[13px] text-secondary-foreground truncate min-w-0 flex-1">{previewText}</span>
            )}
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
                  size={14}
                  className={cn("shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-90")}
                />
              </button>
            </div>
          </div>
          {isLLMType && previewText && <CollapsedTextWithMore text={previewText} lineHeight={17} maxLines={2} />}
        </div>
      </div>
    </div>
  );
}
