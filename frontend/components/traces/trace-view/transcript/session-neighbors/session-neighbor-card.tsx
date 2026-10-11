import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { memo } from "react";

import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { CollapsedPreviewBlock } from "@/components/traces/trace-view/transcript/item/collapsed-preview-block";
import { useElevation } from "@/components/ui/surface";
import { type SessionTraceNeighbor } from "@/lib/actions/sessions";
import { track } from "@/lib/posthog";
import { cn, formatDuration } from "@/lib/utils";

interface SessionNeighborCardProps {
  direction: "prev" | "next";
  neighbor: SessionTraceNeighbor;
  currentStartTime: string;
  onNavigate: (traceId: string) => void;
}

// Styled as a sibling of the subagent card (AgentGroupHeader): same elevation, header row and In preview.
function SessionNeighborCardInner({ direction, neighbor, currentStartTime, onNavigate }: SessionNeighborCardProps) {
  const isPrev = direction === "prev";
  const { className: elevationClassName } = useElevation({ offset: 2 });
  const gap = formatDuration(Math.abs(new Date(currentStartTime).getTime() - new Date(neighbor.startTime).getTime()));
  const preview = neighbor.agentInputPreview || neighbor.topSpanName;

  const handleClick = () => {
    track("sessions", "trace_navigated", { source: "transcript_card", direction });
    onNavigate(neighbor.id);
  };

  return (
    <div className={isPrev ? "pt-2 pb-1" : "pt-3 pb-1"}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        className={cn(
          "mx-2 border rounded-lg overflow-hidden cursor-pointer transition-colors hover:bg-surface-up-2",
          elevationClassName
        )}
      >
        <div className="flex flex-col flex-1 min-w-0 px-2 py-2 gap-1">
          <div className="flex gap-2 items-center min-w-0">
            <div className="flex items-center justify-center shrink-0 text-muted-foreground size-5 min-w-5 min-h-5">
              {isPrev ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            </div>
            <span className="font-medium text-[13px] whitespace-nowrap">
              {isPrev ? "Previous trace" : "Next trace"}
            </span>
            {gap && (
              <span className="text-xs text-muted-foreground truncate">
                {isPrev ? `${gap} earlier` : `${gap} later`}
              </span>
            )}
            <div className="flex items-center shrink-0 ml-auto gap-2">
              <SpanStatsShield
                variant="inline"
                startTime={neighbor.startTime}
                endTime={neighbor.endTime}
                inputTokens={neighbor.inputTokens}
                outputTokens={neighbor.outputTokens}
                cost={neighbor.totalCost}
                cacheReadInputTokens={neighbor.cacheReadInputTokens}
              />
              <ChevronRight size={14} className="shrink-0 text-secondary-foreground" />
            </div>
          </div>
          <CollapsedPreviewBlock text={preview} isLoading={false} variant="collapsed" />
        </div>
      </div>
    </div>
  );
}

export const SessionNeighborCard = memo(SessionNeighborCardInner);
