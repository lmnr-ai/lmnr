"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationScoreAnalysis, type EvaluationScoreBin } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import DistributionBarChart from "./bar-chart";
import MetaLine from "./meta-line";
import ScoreTabs from "./score-tabs";
import { filtersForBin, isBinSelected, nextFilterParams } from "./utils";

interface DistributionChartProps {
  scoreNames: string[];
  analyses: Record<string, EvaluationScoreAnalysis | undefined>;
  isLoading?: boolean;
  /**
   * Persistence key for the collapse state. Scoped per page-context (e.g.
   * single vs shared evaluation) so each page can remember its own choice.
   */
  persistKey?: string;
  /**
   * Controls whether clicking a bar updates URL filters. Defaults to true;
   * both single and shared evaluation routes read `filter` params from the
   * URL and round-trip through the same query schema, so bin click works
   * identically on both. Set to false only when a consumer renders the
   * chart outside an evaluation route (where the `score:<name>` column
   * wouldn't resolve).
   */
  enableBinClick?: boolean;
}

const COLLAPSE_KEY_PREFIX = "lmnr.distribution-chart.collapsed.";

function readCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSE_KEY_PREFIX + key, value ? "1" : "0");
  } catch {
    // storage full / disabled — fail silently, collapse state just
    // resets next mount.
  }
}

export default function DistributionChart({
  scoreNames,
  analyses,
  isLoading = false,
  persistKey = "default",
  enableBinClick = true,
}: DistributionChartProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Initialize from localStorage so the panel doesn't flash open/closed
  // across page navigations.
  const [collapsed, setCollapsedState] = useState<boolean>(() => readCollapsed(persistKey));
  useEffect(() => {
    writeCollapsed(persistKey, collapsed);
  }, [collapsed, persistKey]);

  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => scoreNames[0]);

  // Derive the effective selection in render-phase instead of syncing
  // via useEffect: if the stored selection isn't in the current
  // scoreNames (can happen on filter change that removes all rows with
  // that score), fall back to the first available.
  const effectiveSelected = selectedScore && scoreNames.includes(selectedScore) ? selectedScore : scoreNames[0];

  const currentAnalysis = effectiveSelected ? analyses[effectiveSelected] : undefined;

  const existingFilterStrs = useMemo(() => searchParams.getAll("filter"), [searchParams]);

  const selectedBinIndex = useMemo(() => {
    if (!currentAnalysis || !effectiveSelected || !enableBinClick) return null;
    const idx = currentAnalysis.bins.findIndex((bin, i) =>
      isBinSelected(existingFilterStrs, effectiveSelected, filtersForBin(effectiveSelected, bin, i, currentAnalysis))
    );
    return idx === -1 ? null : idx;
  }, [currentAnalysis, effectiveSelected, existingFilterStrs, enableBinClick]);

  const handleBinClick = useCallback(
    (bin: EvaluationScoreBin, index: number) => {
      if (!enableBinClick || !effectiveSelected || !currentAnalysis) return;
      const binFilters = filtersForBin(effectiveSelected, bin, index, currentAnalysis);
      const nextFilters = nextFilterParams(existingFilterStrs, effectiveSelected, binFilters);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("filter");
      nextFilters.forEach((f) => params.append("filter", f));
      router.push(`${pathname}?${params.toString()}`);
    },
    [enableBinClick, effectiveSelected, currentAnalysis, existingFilterStrs, searchParams, pathname, router]
  );

  // Collapsed strip — a thin single-row affordance with a "show" chevron.
  if (collapsed) {
    return (
      <div className="flex items-center justify-between rounded border bg-secondary px-4 py-2">
        <span className="text-xs text-muted-foreground">Distribution chart hidden</span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => setCollapsedState(false)}>
          Show distribution chart
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded border bg-secondary p-4")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <Skeleton className="h-7 w-64" />
          ) : (
            <ScoreTabs
              scoreNames={scoreNames}
              analyses={analyses}
              selected={effectiveSelected}
              onSelect={setSelectedScore}
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-none"
          onClick={() => setCollapsedState(true)}
          aria-label="Hide distribution chart"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : currentAnalysis && scoreNames.length > 0 ? (
        <>
          <MetaLine analysis={currentAnalysis} />
          <DistributionBarChart
            analysis={currentAnalysis}
            scoreName={effectiveSelected!}
            selectedBinIndex={selectedBinIndex}
            onBinClick={handleBinClick}
          />
        </>
      ) : (
        <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
          No scores yet for this evaluation.
        </div>
      )}
    </div>
  );
}
