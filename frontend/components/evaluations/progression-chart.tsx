import { Minus } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import useSWR from "swr";

import { AggregationFunction } from "@/lib/clickhouse/utils";
import { EvaluationTimeProgression } from "@/lib/evaluation/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";

const ADDITIONAL_NAME = "Total Average";

interface ProgressionChartProps {
  className?: string;
  aggregationFunction: AggregationFunction;
  evaluations: { id: string; name: string }[];
}

export default function ProgressionChart({ className, aggregationFunction, evaluations }: ProgressionChartProps) {
  const [scores, setScores] = useState<string[]>([]);
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");
  const params = useParams();

  const evaluationsSearchParams = useMemo(
    () => new URLSearchParams([...evaluations.map(({ id }) => ["id", id]), ["aggregate", aggregationFunction]]),
    [evaluations, aggregationFunction]
  );

  const { data, isLoading } = useSWR<EvaluationTimeProgression[]>(
    `/api/projects/${params?.projectId}/evaluation-groups/${groupId}/progression?${evaluationsSearchParams}`,
    swrFetcher
  );

  const keys = useMemo(() => new Set(data?.flatMap(({ names }) => names) ?? []), [data]);

  useEffect(() => {
    setScores(Array.from(keys));
  }, [keys]);

  const convertedScores = useMemo(() => {
    const map: Record<string, string> = evaluations.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.name }), {});
    return (
      data?.map(({ timestamp, evaluationId, names, values }) => {
        const extendedNames = [...names, ADDITIONAL_NAME];
        const extendedValues = values.length > 0
          ? [...values, values.reduce((acc, curr) => acc + Number(curr), 0) / values.length]
          : [0];
        return {
          timestamp,
          evaluationId,
          name: map[evaluationId] || "-",
          ...Object.fromEntries(extendedNames.map((name, index) => [name, extendedValues[index]])),
        };
      }) ?? []
    );
  }, [data, evaluations]);

  const chartConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        [...Array.from(keys), ADDITIONAL_NAME].map((key, index) => [
          key,
          {
            color: `hsl(var(--chart-${(index % 5) + 1}))`,
            label: key,
          },
        ])
      ),
    [keys]
  );

  const horizontalPadding = Math.max(10 - (data?.length ?? 0), 0) * 50;

  const handleClick = useCallback((key: string) => {
    setScores((prevScores) =>
      prevScores.includes(key) ? prevScores.filter((score) => score !== key) : [...prevScores, key]
    );
  }, []);

  return (
    <div className={className}>
      {!data && isLoading ? (
        <Skeleton className="size-full" />
      ) : (
        <>
          <ChartContainer config={chartConfig} className="h-5/6 w-full">
            <LineChart margin={{ top: 10, right: 10, bottom: 5, left: -12 }} accessibilityLayer data={convertedScores}>
              <CartesianGrid vertical={false} />
              <XAxis
                type="category"
                dataKey="timestamp"
                tickLine={false}
                axisLine={false}
                tick={false}
                height={8}
                padding={{ left: horizontalPadding, right: horizontalPadding }}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={5} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    className="min-w-60"
                    labelFormatter={(value, payload) => (
                      <>
                        <p className="text-secondary-foreground">{formatTimestamp(`${value}Z`)}</p>
                        <p>{payload?.[0]?.payload?.name}</p>
                      </>
                    )}
                  />
                }
              />
              {[...Array.from(keys), ADDITIONAL_NAME]
                .filter((key) => scores.includes(key))
                .map((key) => (
                  <Line
                    dot={{
                      stroke: chartConfig[key].color,
                      strokeWidth: 4,
                      r: 2,
                    }}
                    dataKey={key}
                    stroke={chartConfig[key].color}
                    key={key}
                    isAnimationActive={false}
                  />
                ))}
            </LineChart>
          </ChartContainer>
          <div className="flex flex-row justify-center w-full mt-2 space-x-2 items-center">
            {[...Array.from(keys), ADDITIONAL_NAME].map((key) => (
              <div
                key={key}
                className="flex items-center text-sm cursor-pointer decoration-dashed text-muted-foreground"
                style={
                  scores.includes(key)
                    ? {
                      color: chartConfig[key].color,
                    }
                    : {}
                }
                onClick={() => handleClick(key)}
              >
                <Minus className="h-4 w-4 mt-1" />
                <Label className="cursor-pointer">{key}</Label>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
