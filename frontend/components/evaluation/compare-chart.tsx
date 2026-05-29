import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { renderTick } from "@/components/evaluation/graphs-utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationScoreDistributionBucket } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface CompareChartProps {
  className?: string;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution: EvaluationScoreDistributionBucket[] | null;
  isLoading?: boolean;
}

const chartConfig = {
  ["index"]: {
    color: "hsl(var(--chart-1))",
  },
};

export default function CompareChart({
  className,
  distribution,
  comparedDistribution,
  isLoading = false,
}: CompareChartProps) {
  const chartData = distribution
    ? distribution.map((bucket, index) => ({
        index,
        height: bucket.heights[0],
        comparedHeight: comparedDistribution?.[index]?.heights[0] || 0,
      }))
    : [];

  return (
    <div className={cn("w-full h-full", className)}>
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
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
            <Bar dataKey="comparedHeight" fill="hsl(var(--chart-2))" radius={4} name="Compared" />
            <Bar dataKey="height" fill="hsl(var(--chart-1))" radius={4} name="Current" />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
