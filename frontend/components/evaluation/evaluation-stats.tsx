import { useProjectContext } from "@/contexts/project-context";
import { EvaluationStats as EvaluationStatsType } from "@/lib/evaluation/types";
import { cn, swrFetcher } from "@/lib/utils";
import useSWR from "swr";
import { Button } from "../ui/button";
import { ArrowRight, RefreshCw } from "lucide-react";

const Diff = ({ originalVal, comparedVal, decimalPlaces }: { originalVal: number, comparedVal: number, decimalPlaces: number }) => {
  const diff = originalVal - comparedVal;
  return (
    <div className={cn("text-secondary-foreground", (diff >= 0 ? "text-green-500" : "text-red-500"))}>
      {diff >= 0 ? "+" : ""}{decimalPlaces !== 0 ? diff.toFixed(decimalPlaces) : diff}
    </div>
  )
}

interface EvaluationStatsProps {
  evaluationId: string;
  comparedEvaluationId?: string;
}

export default function EvaluationStats({
  evaluationId,
  comparedEvaluationId,
}: EvaluationStatsProps) {
  const { projectId } = useProjectContext();

  const { data, error, mutate, isLoading } = useSWR(`/api/projects/${projectId}/evaluations/${evaluationId}/stats`, swrFetcher);
  const { data: comparedData, error: comparedError, mutate: comparedMutate, isLoading: comparedIsLoading } = useSWR(comparedEvaluationId ? `/api/projects/${projectId}/evaluations/${comparedEvaluationId}/stats` : null, swrFetcher);
  const evaluationStats = data as EvaluationStatsType;
  const comparedStats = comparedData as EvaluationStatsType;

  if (error || comparedError) return <div className='m-2 text-rose-900'>Error fetching stats. Please try again</div>;

  return (
    <div className="flex-none flex flex-col w-96 border-l p-4 pt-0">
      <div className="flex-none h-14 flex items-center">
        <h1 className="text-lg font-bold flex-grow">Mean scores</h1>
        <Button variant={'ghost'} disabled={isLoading || (comparedIsLoading ?? false)}>
          <RefreshCw size={12} onClick={_e => { mutate(); comparedMutate?.() }} />
        </Button>
      </div>
      <div className="flex flex-col space-y-4">
        {Object.entries(evaluationStats ?? {}).map(([scoreName, score], index) => (
          <div key={index}>
            <div className="flex flex-row space-x-2 justify-between">
              <div className="text-secondary-foreground flex items-center space-x-1">
                {scoreName}
              </div>
              {comparedEvaluationId && evaluationStats && comparedStats && comparedStats[scoreName] !== undefined &&

                <Diff
                  originalVal={score}
                  comparedVal={comparedStats[scoreName]}
                  decimalPlaces={2}
                />
              }
            </div>
            <div className="flex flex-row items-center space-x-2 font-mono">
              {comparedStats && (
                <>
                  <div className="text-lg font-bold text-secondary-foreground">
                    {comparedStats[scoreName]?.toFixed(2)}
                  </div>
                  <ArrowRight size={16} />
                </>
              )}
              <div className={cn("text-lg font-bold", !!comparedStats && "text-blue-300")}>
                {evaluationStats ? score.toFixed(2) : '-'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
