import { useParams, useSearchParams } from "next/navigation";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { type AggregationFunction } from "@/lib/clickhouse/types";
import { type EvaluationTimeProgression } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import { type ChartConfig } from "../../ui/chart";
import { Label } from "../../ui/label";
import { Skeleton } from "../../ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import CombinedChart from "./combined-chart";
import CombinedLegend from "./combined-legend";
import GroupedBarChart from "./grouped-bar-chart";
import { type ChartVariant, type ProgressionPoint } from "./shared";
import SplitCharts from "./split-charts";

const VARIANT_PARSER = parseAsStringEnum<ChartVariant>(["grouped", "split", "combined"]).withDefault("grouped");

export function useChartVariant() {
  return useQueryState("chart", VARIANT_PARSER);
}

export function ChartVariantToggle() {
  const [variant, setVariant] = useChartVariant();
  return (
    <Tabs className="inline-block" value={variant} onValueChange={(v) => setVariant(v as ChartVariant)}>
      <TabsList className="h-8">
        <TabsTrigger className="text-xs" value="grouped">
          Grouped
        </TabsTrigger>
        <TabsTrigger className="text-xs" value="combined">
          Combined
        </TabsTrigger>
        <TabsTrigger className="text-xs" value="split">
          Split
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

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
}

export default function ProgressionChart({
  className,
  aggregationFunction,
  evaluations,
  baselineEvaluationId,
  hoveredEvaluationId,
}: ProgressionChartProps) {
  const [scores, setScores] = useState<string[]>([]);
  const [variant] = useChartVariant();
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");
  const params = useParams();

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

  useEffect(() => {
    setScores(scoreKeys);
  }, [scoreKeys]);

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

  const toggleScore = useCallback((key: string) => {
    setScores((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  }, []);

  if (!data && isLoading) {
    return (
      <div className={className}>
        <Skeleton className="size-full" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex-1 min-h-0 min-w-0">
        {variant === "grouped" ? (
          <GroupedBarChart data={points} scores={scoreKeys} visibleScores={scores} chartConfig={chartConfig} />
        ) : variant === "combined" ? (
          <div className="flex h-full w-full gap-3 min-w-0">
            <CombinedLegend
              scores={scoreKeys}
              visibleScores={scores}
              chartConfig={chartConfig}
              onToggle={toggleScore}
              className="w-32 shrink-0 overflow-y-auto"
            />
            <div className="min-w-0 flex-1">
              <CombinedChart
                data={points}
                scores={scoreKeys}
                visibleScores={scores}
                chartConfig={chartConfig}
                hoveredEvaluationId={hoveredEvaluationId}
              />
            </div>
          </div>
        ) : (
          <SplitCharts
            data={points}
            scores={scoreKeys}
            visibleScores={scores}
            chartConfig={chartConfig}
            hoveredEvaluationId={hoveredEvaluationId}
            onToggleScore={toggleScore}
          />
        )}
      </div>
      {/* Legend is only meaningful for the grouped variant; combined renders its
          own left-side legend and split labels each card. */}
      {variant === "grouped" && (
        <div className="flex flex-wrap flex-row justify-center w-full mt-2 gap-2 items-center">
          {scoreKeys.map((key) => (
            <div
              key={key}
              className="flex items-center text-sm cursor-pointer decoration-dashed"
              onClick={() => toggleScore(key)}
            >
              <Label style={scores.includes(key) ? { color: chartConfig[key]?.color } : {}} className="cursor-pointer">
                {key}
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
