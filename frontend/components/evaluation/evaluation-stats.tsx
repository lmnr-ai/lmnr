import { useProjectContext } from "@/contexts/project-context";
import { EvaluationStats } from "@/lib/evaluation/types";
import { cn, swrFetcher } from "@/lib/utils";
import { CircleDollarSign, Clock3, Coins, RefreshCw, MoveHorizontal, ArrowRight } from "lucide-react";
import useSWR from "swr";
import { Button } from "../ui/button";

const Diff = ({ originalVal, comparedVal, decimalPlaces }: { originalVal: number, comparedVal: number, decimalPlaces: number }) => {
  const diff = originalVal - comparedVal;
  return (
    <div className={cn("text-secondary-foreground", (diff >= 0 ? "text-green-500" : "text-red-500"))}>
      {diff >= 0 ? "+" : ""}{decimalPlaces !== 0 ? diff.toFixed(decimalPlaces) : diff}
    </div>
  )
}

interface Stat {
  name: string;
  key: 'averageScore' | 'averageExecutorTime' | 'executorTokens' | 'executorCost' | 'averageEvaluatorTime' | 'evaluatorTokens' | 'evaluatorCost';
  icon: any;
  precision: number;
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
  const evaluationStats = data as EvaluationStats;
  const comparedStats = comparedData as EvaluationStats;

  if (error || comparedError) return <div className='m-2 text-rose-900'>Error fetching stats. Please try again</div>;

  const stats: Stat[] = [
    {
      name: 'Average score',
      key: 'averageScore',
      icon: null,
      precision: 2
    },
    {
      name: 'Average executor time (s)',
      key: 'averageExecutorTime',
      icon: Clock3,
      precision: 3
    },
    {
      name: 'Executor tokens',
      key: 'executorTokens',
      icon: Coins,
      precision: 0
    },
    {
      name: 'Executor cost',
      key: 'executorCost',
      icon: CircleDollarSign,
      precision: 5
    },
    {
      name: 'Average evaluator time (s)',
      key: 'averageEvaluatorTime',
      icon: Clock3,
      precision: 3
    },
    {
      name: 'Evaluator tokens',
      key: 'evaluatorTokens',
      icon: Coins,
      precision: 0
    },
    {
      name: 'Evaluator cost',
      key: 'evaluatorCost',
      icon: CircleDollarSign,
      precision: 5
    },
  ]

  return (
    <div className="flex-none flex flex-col w-96 border-l p-4 pt-0">
      <div className="flex-none h-14 flex items-center">
        <h1 className="text-lg font-bold flex-grow">Statistics</h1>
        <Button variant={'ghost'} disabled={isLoading || (comparedIsLoading ?? false)}>
          <RefreshCw size={12} onClick={_e => { mutate(); comparedMutate?.() }} />
        </Button>
      </div>
      <div className="flex flex-col space-y-4">
        {stats.map((stat, index) => (
          <div key={index}>
            <div className="flex flex-row space-x-2 justify-between">
              <div className="text-secondary-foreground flex items-center space-x-1">
                {stat.icon && <stat.icon size={16} />}
                <div>
                  {stat.name}
                </div>
              </div>
              {comparedEvaluationId && evaluationStats && comparedData &&
                <Diff
                  originalVal={evaluationStats[stat.key] ?? 0}
                  comparedVal={comparedStats[stat.key] ?? 0}
                  decimalPlaces={stat.precision}
                />
              }
            </div>
            <div className="flex flex-row items-center space-x-2 font-mono">
              {comparedStats && (
                <>
                  <div className="text-lg font-bold text-secondary-foreground">
                    {stat.precision > 0 ? comparedStats[stat.key]?.toFixed(stat.precision) : comparedStats[stat.key]}
                  </div>
                  <ArrowRight size={16} />
                </>
              )}
              <div className={cn("text-lg font-bold", !!comparedStats && "text-blue-300")}>
                {evaluationStats && (stat.precision > 0 ? evaluationStats[stat.key]?.toFixed(stat.precision) : evaluationStats[stat.key])}
                {!evaluationStats && '-'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
