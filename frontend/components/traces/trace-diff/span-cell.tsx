"use client";

import { type Change } from "diff";
import { isNil } from "lodash";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import Markdown from "@/components/traces/trace-view/list/markdown";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";
import { getSpanDisplayName } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EXPANDABLE_TYPES = new Set(["LLM", "CACHED", "EXECUTOR", "EVALUATOR"]);

const DiffContent = ({ changes, side }: { changes: Change[]; side: "left" | "right" }) => (
  <div className="font-mono text-xs whitespace-pre-wrap break-all leading-5 max-h-60 overflow-hidden">
    {changes.map((change, i) => {
      if (side === "left" && change.added) return null;
      if (side === "right" && change.removed) return null;

      const isHighlighted = (side === "left" && change.removed) || (side === "right" && change.added);

      return (
        <span
          key={i}
          className={cn(
            isHighlighted && side === "left" && "bg-red-500/20 text-destructive",
            isHighlighted && side === "right" && "bg-green-500/20 text-green-300"
          )}
        >
          {change.value}
        </span>
      );
    })}
  </div>
);

const SpanCell = ({
  span,
  output,
  diffSide,
  diffChanges,
}: {
  span: TraceViewListSpan;
  output: unknown;
  diffSide?: "left" | "right";
  diffChanges?: Change[];
}) => {
  const isLoadingOutput = output === undefined;
  const [isExpanded, setIsExpanded] = useState(EXPANDABLE_TYPES.has(span.spanType));

  useEffect(() => {
    setIsExpanded(EXPANDABLE_TYPES.has(span.spanType));
  }, [span.spanId, span.spanType]);

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-2 py-2 group/cell">
        <SpanTypeIcon spanType={span.spanType} size={14} containerWidth={20} containerHeight={20} />
        <span className="truncate text-sm font-medium">{getSpanDisplayName(span)}</span>
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
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
        <SpanStatsShield
          className="ml-auto flex-shrink-0 hidden group-hover/cell:flex"
          startTime={span.startTime}
          endTime={span.endTime}
          tokens={span.totalTokens}
          cost={span.totalCost}
          cacheReadInputTokens={span.cacheReadInputTokens}
        />
      </div>
      {isExpanded && (
        <div className="px-3 pb-2 pt-0">
          {isLoadingOutput ? (
            <Skeleton className="h-12 w-full" />
          ) : diffSide && diffChanges ? (
            <DiffContent changes={diffChanges} side={diffSide} />
          ) : isNil(output) ? (
            <div className="text-sm text-muted-foreground italic">No output available</div>
          ) : (
            <Markdown className="max-h-60" output={output} />
          )}
        </div>
      )}
    </div>
  );
};

export default SpanCell;
