import { useParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import useSWR from "swr";

import { renderTick } from "@/components/evaluation/graphs-utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { BucketRow } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface ChartProps {
  evaluationId: string;
  className?: string;
  scoreName: string;
}

const newChartConfig = {
  ["index"]: {
    color: "hsl(var(--chart-1))",
  },
};

export default function Chart({ evaluationId, className, scoreName }: ChartProps) {
  const params = useParams();

  const { data, isLoading } = useSWR<BucketRow[]>(
    `/api/projects/${params?.projectId}/evaluation-score-distribution?` +
      `evaluationIds=${evaluationId}&scoreName=${scoreName}`,
    swrFetcher
  );

  return (
    <div className={className}>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ChartContainer config={newChartConfig} className="max-h-48 w-full">
          <BarChart
            accessibilityLayer
            data={(data ?? []).map((row: BucketRow, index: number) => ({
              index,
              height: row.heights[0],
            }))}
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
