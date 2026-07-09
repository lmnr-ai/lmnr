import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { type EvaluationTimeProgression } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import { type ChartConfig } from "../../ui/chart";
import { Skeleton } from "../../ui/skeleton";
import CombinedChart from "./combined-chart";
import CombinedLegend from "./combined-legend";
import { type ProgressionPoint } from "./shared";

interface ProgressionChartProps {
  className?: string;
  /** Whole-group progression, fetched once by the parent (single source). */
  data?: EvaluationTimeProgression[];
  isLoading?: boolean;
  /** Loaded runs, used only to label points (names). */
  evaluations: { id: string; name: string }[];
  /** Runs hidden from the chart. Render-only — they stay in the data so a hidden baseline still subtracts. */
  hiddenEvaluationIds?: string[];
  baselineEvaluationId?: string;
  hoveredEvaluationId?: string;
  onPointClick?: (evaluationId: string) => void;
}

const EMPTY_IDS: string[] = [];

export default function ProgressionChart({
  className,
  data,
  isLoading,
  evaluations,
  hiddenEvaluationIds = EMPTY_IDS,
  baselineEvaluationId,
  hoveredEvaluationId,
  onPointClick,
}: ProgressionChartProps) {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");
  const params = useParams();
  const [hoveredScore, setHoveredScore] = useState<string | null>(null);

  // Persist deselected scores (not selected) so newly-appearing scores default to visible.
  const [hiddenScores, setHiddenScores] = useLocalStorage<string[]>(
    `evaluations-chart-hidden-scores:${params?.projectId}:${groupId ?? ""}`,
    EMPTY_IDS
  );

  const scoreKeys = useMemo(() => Array.from(new Set(data?.flatMap(({ names }) => names) ?? [])), [data]);

  const scores = useMemo(() => scoreKeys.filter((key) => !hiddenScores.includes(key)), [scoreKeys, hiddenScores]);

  const points: ProgressionPoint[] = useMemo(() => {
    const nameById: Record<string, string> = evaluations.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.name }), {});
    const raw =
      data?.map(({ timestamp, evaluationId, names, values }) => {
        const valueMap: Record<string, number | null> = {};
        for (const score of scoreKeys) {
          const idx = names.indexOf(score);
          if (idx === -1) {
            valueMap[score] = null;
          } else {
            const v = Number(values[idx]);
            valueMap[score] = isNaN(v) ? null : v;
          }
        }
        return {
          timestamp,
          evaluationId,
          name: nameById[evaluationId] || "-",
          values: valueMap,
        };
      }) ?? [];

    if (!baselineEvaluationId) return raw;
    const baselinePoint = raw.find((p) => p.evaluationId === baselineEvaluationId);
    if (!baselinePoint) return raw;
    // Subtract baseline per-score; null baseline or null value → null (no relative signal).
    return raw.map((p) => {
      const rel: Record<string, number | null> = {};
      for (const score of scoreKeys) {
        const v = p.values[score];
        const b = baselinePoint.values[score];
        rel[score] = v === null || b === null ? null : v - b;
      }
      return { ...p, values: rel };
    });
  }, [data, evaluations, scoreKeys, baselineEvaluationId]);

  // Baseline subtraction above runs over the full group (so a hidden baseline
  // still zeroes the others); hidden runs are dropped only from what's drawn.
  const visiblePoints = useMemo(
    () => points.filter((p) => !hiddenEvaluationIds.includes(p.evaluationId)),
    [points, hiddenEvaluationIds]
  );

  const chartConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        scoreKeys.map((key, index) => [
          key,
          {
            color: `hsl(var(--chart-${(index % 5) + 1}))`,
            label: key,
          },
        ])
      ),
    [scoreKeys]
  );

  const toggleScore = useCallback(
    (key: string) => {
      setHiddenScores((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
    },
    [setHiddenScores]
  );

  if (!data && isLoading) {
    return (
      <div className={className}>
        <Skeleton className="size-full" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-1 gap-3 min-h-0 min-w-0 rounded-[4px] border border-border bg-secondary px-4 py-3">
        <CombinedLegend
          scores={scoreKeys}
          visibleScores={scores}
          chartConfig={chartConfig}
          onToggle={toggleScore}
          onHoverScore={setHoveredScore}
          className="w-32 shrink-0 overflow-y-auto"
        />
        <div className="min-w-0 flex-1">
          <CombinedChart
            data={visiblePoints}
            scores={scoreKeys}
            visibleScores={scores}
            chartConfig={chartConfig}
            hoveredEvaluationId={hoveredEvaluationId}
            hoveredScore={hoveredScore}
            onPointClick={onPointClick}
          />
        </div>
      </div>
    </div>
  );
}
