import { useParams, useSearchParams } from "next/navigation";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { type AggregationFunction } from "@/lib/clickhouse/types";
import { type EvaluationTimeProgression } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import { type ChartConfig } from "../../ui/chart";
import { Label } from "../../ui/label";
import { Skeleton } from "../../ui/skeleton";
import GroupedBarChart from "./grouped-bar-chart";
import { type ChartVariant, type ProgressionPoint } from "./shared";
import SplitCharts from "./split-charts";

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
}

const VARIANT_PARSER = parseAsStringEnum<ChartVariant>(["grouped", "split"]).withDefault("grouped");

export default function ProgressionChart({ className, aggregationFunction, evaluations }: ProgressionChartProps) {
  const [scores, setScores] = useState<string[]>([]);
  const [variant, setVariant] = useQueryState("chart", VARIANT_PARSER);
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
    const nameById: Record<string, string> = evaluations.reduce(
      (acc, curr) => ({ ...acc, [curr.id]: curr.name }),
      {}
    );
    return (
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
      }) ?? []
    );
  }, [data, evaluations, scoreKeys]);

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
      <div className="flex items-center justify-between gap-2 mb-2">
        <VariantToggle value={variant} onChange={setVariant} />
      </div>
      <div className="flex-1 min-h-0 min-w-0">
        {variant === "grouped" ? (
          <GroupedBarChart data={points} scores={scoreKeys} visibleScores={scores} chartConfig={chartConfig} />
        ) : (
          <SplitCharts data={points} scores={scoreKeys} visibleScores={scores} chartConfig={chartConfig} />
        )}
      </div>
      <div className="flex flex-wrap flex-row justify-center w-full mt-2 gap-2 items-center">
        {scoreKeys.map((key) => (
          <div
            key={key}
            className="flex items-center text-sm cursor-pointer decoration-dashed"
            onClick={() => toggleScore(key)}
          >
            <Label
              style={scores.includes(key) ? { color: chartConfig[key]?.color } : {}}
              className="cursor-pointer"
            >
              {key}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}

function VariantToggle({ value, onChange }: { value: ChartVariant; onChange: (v: ChartVariant) => void }) {
  const options: { value: ChartVariant; label: string }[] = [
    { value: "grouped", label: "Grouped" },
    { value: "split", label: "Split" },
  ];
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? "secondary" : "ghost"}
          size="sm"
          className={cn("h-6 px-2", value === opt.value ? "" : "border-transparent")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
