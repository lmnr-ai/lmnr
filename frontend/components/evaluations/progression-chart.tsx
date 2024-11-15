import { useProjectContext } from "@/contexts/project-context";
import { swrFetcher, cn, formatTimestamp } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { CartesianGrid, XAxis, LineChart, Line, YAxis } from "recharts";
import useSWR from "swr";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";
import { Skeleton } from "../ui/skeleton";
import { EvaluationTimeProgression } from "@/lib/evaluation/types";
import { useEffect, useState } from "react";
import { Minus } from "lucide-react";
import { Label } from "../ui/label";
import { AggregationFunction } from "@/lib/clickhouse/utils";

interface ProgressionChartProps {
  className?: string;
  aggregationFunction: AggregationFunction;
}

export default function ProgressionChart({
  className,
  aggregationFunction,
}: ProgressionChartProps) {
  const [showScores, setShowScores] = useState<string[]>([]);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const groupId = searchParams.get('groupId');
  const { projectId } = useProjectContext();

  const convertScores = (progression: EvaluationTimeProgression[]) =>
    progression.map(({ timestamp, evaluationId, names, values }) => ({
      timestamp,
      evaluationId,
      ...Object.fromEntries(names.map((name, index) => ([name, values[index]]))),
    }));

  const { data, isLoading, error } = useSWR<EvaluationTimeProgression[]>(
    `/api/projects/${projectId}/evaluation-groups/${groupId}/progression?aggregate=${aggregationFunction}`,
    swrFetcher
  );
  useEffect(() => {
    let newKeys: Set<string> = new Set();
    data?.forEach(({ names }) => {
      names.forEach((name) => {
        newKeys.add(name);
      });
    });
    setKeys(newKeys);
    if (showScores.length === 0) {
      setShowScores(Array.from(newKeys));
    }
  }, [data]);

  const chartConfig = Object.fromEntries(Array.from(keys).map((key, index) => ([
    key, {
      color: `hsl(var(--chart-${index % 5 + 1}))`,
      label: key,
    }
  ]))) satisfies ChartConfig;

  const horizontalPadding = Math.max(10 - (data?.length ?? 0), 0) * 50;

  return (
    <div className={cn('w-full h-full', className)}>
      <ChartContainer
        config={chartConfig as ChartConfig}
        className={cn('h-56', 'w-full')}
      >
        {isLoading || !data || error ? (
          <div className="h-full w-full">
            <Skeleton className="h-full w-full" />
          </div>
        ) : <LineChart
          margin={{ top: 10, right: 10, bottom: 0, left: -24 }}
          accessibilityLayer
          data={convertScores(data)}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            type="category"
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatTimestamp(`${value}Z`)}
            height={8}
            padding={{ left: horizontalPadding, right: horizontalPadding }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickCount={5}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel className="min-w-60" />}
          />
          {Array.from(keys).filter((key) => showScores.includes(key)).map((key) => (
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
        }
      </ChartContainer>
      <div className="flex flex-row justify-center w-full space-x-2 items-center">
        {Array.from(keys).map((key) => (
          <div
            key={key}
            className={
              "flex items-center text-sm cursor-pointer " +
              "decoration-dashed text-muted-foreground"
            }
            style={showScores.includes(key) ? {
              color: chartConfig[key].color,
            } : {}}
            onClick={() => {
              let newShowScores = new Set(showScores);
              if (newShowScores.has(key)) {
                newShowScores.delete(key);
              } else {
                newShowScores.add(key);
              }
              setShowScores(Array.from(newShowScores));
            }}
          >
            <Minus className="h-4 w-4 mt-1" />
            <Label className="cursor-pointer">
              {key}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
