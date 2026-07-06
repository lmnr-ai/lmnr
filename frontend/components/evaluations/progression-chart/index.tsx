import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { type AggregationFunction } from "@/lib/clickhouse/types";
import { type EvaluationTimeProgression } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import { type ChartConfig } from "../../ui/chart";
import { Skeleton } from "../../ui/skeleton";
import CombinedChart from "./combined-chart";
import CombinedLegend from "./combined-legend";
import { type ProgressionPoint } from "./shared";

const postFetcher = async ([url, body]: [string, object]) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = (await res.json()) as { error: string };
    throw new Error(errorText.error);
  }

  return res.json();
};

interface ProgressionChartProps {
  className?: string;
  aggregationFunction: AggregationFunction;
  evaluations: { id: string; name: string }[];
  baselineEvaluationId?: string;
  hoveredEvaluationId?: string;
  onPointClick?: (evaluationId: string) => void;
}

const EMPTY_HIDDEN_SCORES: string[] = [];

export default function ProgressionChart({
  className,
  aggregationFunction,
  evaluations,
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
    EMPTY_HIDDEN_SCORES
  );

  const requestBody = useMemo(
    () => ({ ids: evaluations.map(({ id }) => id), aggregate: aggregationFunction }),
    [evaluations, aggregationFunction]
  );

  const { data, isLoading } = useSWR<EvaluationTimeProgression[]>(
    [
      `/api/projects/${params?.projectId}/evaluation-groups/${encodeURIComponent(groupId ?? "")}/progression`,
      requestBody,
    ],
    postFetcher
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
            data={points}
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
