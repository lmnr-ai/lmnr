"use client";

import { ArrowRight } from "lucide-react";

import { pctChange } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface MetricsChipsProps {
  scoreNames: string[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  isComparison?: boolean;
  selectedScore?: string;
  onSelectScore?: (name: string) => void;
  className?: string;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * One-row glanceable aggregate: a chip per score (avg + delta when comparing).
 * In trace-first compositions the selected chip doubles as the sidebar's
 * "primary score", so selection here re-sorts the sidebar.
 */
export default function MetricsChips({
  scoreNames,
  allStatistics,
  comparedAllStatistics,
  isComparison,
  selectedScore,
  onSelectScore,
  className,
}: MetricsChipsProps) {
  const ordered = [...scoreNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {ordered.map((name) => {
        const cur = allStatistics?.[name]?.averageValue;
        const cmp = isComparison ? comparedAllStatistics?.[name]?.averageValue : undefined;
        const change = isValidNumber(cur) && isValidNumber(cmp) ? pctChange(cur, cmp) : null;
        const improved = change !== null && change >= 0;
        const selected = name === selectedScore;
        return (
          <button
            key={name}
            onClick={() => onSelectScore?.(name)}
            className={cn(
              "flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted",
              selected ? "border-primary/60 bg-muted" : "bg-secondary"
            )}
            title={selected ? `${name} (primary)` : name}
          >
            <span className="text-muted-foreground">{name}</span>
            <span className="flex items-center gap-1 font-medium tabular-nums">
              {isValidNumber(cmp) && (
                <>
                  <span className="text-muted-foreground">{fmt(cmp)}</span>
                  <ArrowRight className="size-2.5 text-muted-foreground" />
                </>
              )}
              {isValidNumber(cur) ? fmt(cur) : "—"}
            </span>
            {change !== null && (
              <span className={cn("tabular-nums text-[0.7rem]", improved ? "text-success-bright" : "text-destructive")}>
                {improved ? "▲" : "▼"}
                {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
