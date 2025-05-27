import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { renderTick } from "@/components/evaluation/graphs-utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { EvaluationScoreDistributionBucket } from "@/lib/evaluation/types";

interface ChartProps {
  evaluationId: string;
  className?: string;
  scoreName: string;
  distribution: EvaluationScoreDistributionBucket[] | null;
  isLoading?: boolean;
}

const newChartConfig = {
  ["index"]: {
    color: "hsl(var(--chart-1))",
  },
};

export default function Chart({ evaluationId, className, scoreName, distribution, isLoading = false }: ChartProps) {
  // Convert distribution data to the format expected by the chart
  const chartData = distribution ? distribution.map((bucket, index) => ({
    index,
    height: bucket.heights[0],
  })) : [];

  return (
    <div className={className}>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ChartContainer config={newChartConfig} className="max-h-48 w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            barSize="4%"
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="index"
              tickLine={false}
              axisLine={true}
              padding={{ left: 0, right: 0 }}
              tick={renderTick as any}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={3} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar key={scoreName} dataKey="height" fill="hsl(var(--chart-1))" radius={4} name={scoreName} />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
