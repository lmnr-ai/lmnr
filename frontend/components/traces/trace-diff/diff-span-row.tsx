"use client";

import { isNil } from "lodash";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import Markdown from "@/components/traces/trace-view/list/markdown";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type DiffRow } from "./trace-diff-types";
import { getSpanDisplayName } from "./trace-diff-utils";

const EXPANDABLE_TYPES = new Set(["LLM", "CACHED", "EXECUTOR", "EVALUATOR"]);

export function SpanCell({ span, output }: { span: TraceViewListSpan; output: unknown }) {
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
          ) : isNil(output) ? (
            <div className="text-sm text-muted-foreground italic">No output available</div>
          ) : (
            <Markdown className="max-h-60" output={output} />
          )}
        </div>
      )}
    </div>
  );
}

function VoidCell({ className }: { className?: string }) {
  return <div className={cn("h-full min-h-[40px] rounded-sm", className)} />;
}

interface DiffSpanRowProps {
  row: DiffRow;
  index: number;
  isSelected: boolean;
  onClick: (index: number) => void;
  leftOutput: unknown;
  rightOutput: unknown;
}

export default function DiffSpanRow({ row, index, isSelected, onClick, leftOutput, rightOutput }: DiffSpanRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(index);
      }}
      className="group/row flex w-full gap-0.5 transition-colors cursor-pointer text-left pb-0.5"
    >
      <div
        className={cn(
          "flex-1 min-w-0 rounded-sm transition-colors",
          row.type !== "right-only" && (isSelected ? "bg-primary/10" : "bg-secondary group-hover/row:bg-secondary/80")
        )}
      >
        {row.type === "right-only" ? <VoidCell /> : <SpanCell span={row.left} output={leftOutput} />}
      </div>
      <div
        className={cn(
          "flex-1 min-w-0 rounded-sm transition-colors",
          row.type !== "left-only" && (isSelected ? "bg-primary/10" : "bg-secondary group-hover/row:bg-secondary/80")
        )}
      >
        {row.type === "left-only" ? <VoidCell /> : <SpanCell span={row.right} output={rightOutput} />}
      </div>
    </div>
  );
}
