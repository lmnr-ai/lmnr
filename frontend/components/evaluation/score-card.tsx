import { ArrowRight } from "lucide-react";

import { EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";

interface ScoreCardProps {
  scores: string[];
  selectedScore?: string;
  setSelectedScore: (score: string) => void;
  statistics: EvaluationScoreStatistics | null;
  comparedStatistics?: EvaluationScoreStatistics | null;
  isLoading?: boolean;
}

export default function ScoreCard({
  scores,
  selectedScore,
  setSelectedScore,
  statistics,
  comparedStatistics,
  isLoading = false,
}: ScoreCardProps) {
  const average = statistics?.averageValue;
  const comparedAverage = comparedStatistics?.averageValue;

  const getPercentageChange = (average: number, comparedAverage: number) =>
    (((average - comparedAverage) / comparedAverage) * 100).toFixed(2);

  const shouldShowComparison =
    isValidNumber(average) && isValidNumber(comparedAverage) && average !== comparedAverage && comparedAverage !== 0;

  return (
    <div className="rounded-lg shadow-md h-full">
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <>
          <Select value={selectedScore} onValueChange={setSelectedScore}>
            <SelectTrigger className="w-fit font-medium text-secondary-foreground h-7">
              <SelectValue placeholder="Select score" className="text-lg" />
            </SelectTrigger>
            <SelectContent>
              {scores.map((score) => (
                <SelectItem key={score} value={score}>
                  {score}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col mt-2">
            <div className="text-sm text-gray-500">Average</div>
            <div className="flex flex-row items-center">
              {isValidNumber(comparedAverage) && (
                <div className="text-5xl font-bold mr-2">{comparedAverage.toFixed(2)}</div>
              )}
              {isValidNumber(comparedAverage) && isValidNumber(average) && (
                <ArrowRight className="min-w-6 text-5xl font-bold mr-2" size={24} />
              )}
              {isValidNumber(average) && <div className="text-5xl font-bold">{average.toFixed(2)}</div>}
            </div>
            {shouldShowComparison && (
              <div
                className={cn("text-md font-medium", {
                  "text-green-400": average >= comparedAverage,
                  "text-red-400": average < comparedAverage,
                })}
              >
                <span className="mx-1">{average >= comparedAverage ? "▲" : "▼"}</span>
                {Math.abs(average - comparedAverage).toFixed(2)}
                <span> ({getPercentageChange(average, comparedAverage)}%)</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
