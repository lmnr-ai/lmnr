"use client";

import { cn } from "@/lib/utils";

import { type ChartConfig } from "../../ui/chart";

interface CombinedLegendProps {
  scores: string[];
  visibleScores: string[];
  chartConfig: ChartConfig;
  onToggle?: (score: string) => void;
  onHoverScore?: (score: string | null) => void;
  className?: string;
}

export default function CombinedLegend({
  scores,
  visibleScores,
  chartConfig,
  onToggle,
  onHoverScore,
  className,
}: CombinedLegendProps) {
  return (
    <div className={cn("flex flex-col gap-2 min-w-0", className)} onMouseLeave={() => onHoverScore?.(null)}>
      {scores.map((score) => {
        const visible = visibleScores.includes(score);
        const color = chartConfig[score]?.color ?? "hsl(var(--chart-1))";
        const interactive = !!onToggle;
        const Comp: "button" | "div" = interactive ? "button" : "div";
        return (
          <Comp
            key={score}
            title={score}
            onClick={interactive ? () => onToggle?.(score) : undefined}
            // Only the container clears the hover: per-item leaves fire in the gaps between items and flash every line back.
            onMouseEnter={() => onHoverScore?.(visible ? score : null)}
            className={cn(
              "flex items-center gap-2 text-left text-sm truncate",
              interactive && "cursor-pointer hover:opacity-80"
            )}
          >
            <span
              className="size-2.5 rounded-sm shrink-0"
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
