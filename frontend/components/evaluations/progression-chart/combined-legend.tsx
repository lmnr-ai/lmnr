"use client";

import { cn } from "@/lib/utils";

import { type ChartConfig } from "../../ui/chart";

interface CombinedLegendProps {
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
  onToggle?: (score: string) => void;
  className?: string;
}

export default function CombinedLegend({
  scores,
  visibleScores,
  chartConfig,
  onToggle,
  className,
}: CombinedLegendProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      {scores.map((score) => {
        const visible = visibleScores.includes(score);
        const color = chartConfig[score]?.color ?? "hsl(var(--chart-1))";
        const interactive = !!onToggle;
        const Comp: "button" | "div" = interactive ? "button" : "div";
        return (
          <Comp
            key={score}
            onClick={interactive ? () => onToggle?.(score) : undefined}
            className={cn(
              "flex items-center gap-1.5 text-left text-xs truncate",
              interactive && "cursor-pointer hover:opacity-80"
            )}
          >
            <span
              className="size-2 rounded-sm shrink-0"
              style={{
                background: visible ? color : "transparent",
                border: visible ? undefined : `1px solid ${color}`,
              }}
            />
            <span className={cn("truncate", visible ? "" : "text-muted-foreground")}>{score}</span>
          </Comp>
        );
      })}
    </div>
  );
}
