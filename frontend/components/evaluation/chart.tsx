import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { renderTick } from "@/components/evaluation/graphs-utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationScoreDistributionBucket } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface ChartProps {
  className?: string;
  scoreName?: string;
  distribution: EvaluationScoreDistributionBucket[] | null;
  isLoading?: boolean;
  /** When set, this bucket renders at full opacity and every other bar dims to 40%. */
  highlightIndex?: number | null;
}

const newChartConfig = {
  ["index"]: {
    color: "hsl(var(--chart-1))",
  },
};

export default function Chart({ className, scoreName, distribution, isLoading = false, highlightIndex }: ChartProps) {
  const chartData = distribution
    ? distribution.map((bucket, index) => ({
        index,
        height: bucket.heights[0],
      }))
    : [];

  return (
    <div className={cn("w-full h-full", className)}>
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <ChartContainer config={newChartConfig} className="aspect-auto h-full w-full">
          <BarChart accessibilityLayer data={chartData} barSize="4%">
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="index"
              tickLine={false}
              axisLine={true}
              padding={{ left: 0, right: 0 }}
              tick={renderTick as never}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={3} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar key={scoreName} dataKey="height" fill="hsl(var(--chart-1))" radius={4} name={scoreName}>
              {highlightIndex != null &&
                chartData.map((d) => <Cell key={d.index} fillOpacity={d.index === highlightIndex ? 1 : 0.4} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
