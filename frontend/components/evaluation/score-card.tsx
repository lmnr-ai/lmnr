import { ArrowRight } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import useSWR from "swr";

import { useProjectContext } from "@/contexts/project-context";
import { cn, swrFetcher } from "@/lib/utils";

import { Skeleton } from "../ui/skeleton";

interface ScoreCardProps {
  scoreName: string;
}

export default function ScoreCard({ scoreName }: ScoreCardProps) {
  const searchParams = useSearchParams();
  const params = useParams();
  const targetId = searchParams.get("targetId");
  const { projectId } = useProjectContext();

  const { data, isLoading } = useSWR<{ averageValue?: number }>(
    `/api/projects/${projectId}/evaluation-score-stats?evaluationId=${params?.evaluationId}&scoreName=${scoreName}`,
    swrFetcher
  );

  const { data: comparedData, isLoading: isComparedLoading } = useSWR<{ averageValue?: number }>(
    targetId
      ? `/api/projects/${projectId}/evaluation-score-stats?evaluationId=${targetId}&scoreName=${scoreName}`
      : null,
    swrFetcher
  );

  const average = data?.averageValue;
  const comparedAverage = comparedData?.averageValue;

  const getPercentageChange = (average: number, comparedAverage: number) =>
    (((average - comparedAverage) / comparedAverage) * 100).toFixed(2);

  return (
    <div className="rounded-lg shadow-md h-full">
      {isLoading || isComparedLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <>
          <h2 className="text-xl font-semibold mb-4">{scoreName}</h2>
          <div className="flex flex-col">
            <div className="text-sm text-gray-500">Average</div>
            <div className="flex flex-row items-center">
              {comparedAverage && <div className="text-5xl font-bold mr-2">{comparedAverage.toFixed(2)}</div>}
              {comparedAverage && average && <ArrowRight className="min-w-6 text-5xl font-bold mr-2" size={24} />}
              {average && <div className="text-5xl font-bold">{average.toFixed(2)}</div>}
            </div>
            {comparedAverage && average && (
              <div
                className={cn("text-md font-medium", {
                  "text-green-400": average >= comparedAverage,
                  "text-red-400": average < comparedAverage,
                })}
              >
                <span className="mx-1">{average >= comparedAverage ? "▲" : "▼"}</span>
                {Math.abs(average - comparedAverage).toFixed(2)}
                {comparedData.averageValue !== 0 && <span> ({getPercentageChange(average, comparedAverage)}%)</span>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
