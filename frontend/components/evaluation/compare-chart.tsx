import { useParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import useSWR from "swr";

import { renderTick } from "@/components/evaluation/graphs-utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { BucketRow } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface CompareChatProps {
  evaluationId: string;
  comparedEvaluationId: string;
  scoreName: string;
  className?: string;
}

const chartConfig = {
  ["index"]: {
    color: "hsl(var(--chart-1))",
  },
};

export default function CompareChart({ evaluationId, comparedEvaluationId, scoreName, className }: CompareChatProps) {
  const params = useParams();

  const { data, isLoading } = useSWR<BucketRow[]>(
    `/api/projects/${params?.projectId}/evaluation-score-distribution?` +
      `evaluationIds=${evaluationId},${comparedEvaluationId}&scoreName=${scoreName}`,
    swrFetcher
  );

  return (
    <div className={className}>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ChartContainer config={chartConfig} className="max-h-48 w-full">
          <BarChart
            accessibilityLayer
            data={(data ?? []).map((row: BucketRow, index: number) => ({
              index,
              height: row.heights[0],
              comparedHeight: row.heights[1],
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
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="comparedHeight" fill="hsl(var(--chart-2))" radius={4} name="Compared" />
            <Bar dataKey="height" fill="hsl(var(--chart-1))" radius={4} name="Current" />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
