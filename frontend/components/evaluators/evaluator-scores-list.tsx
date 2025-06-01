import { TooltipPortal } from "@radix-ui/react-tooltip";
import { SquareFunction } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EvaluatorScore } from "@/lib/evaluators/types";
import { swrFetcher } from "@/lib/utils";

interface EvaluatorScoresListProps {
  spanId: string;
}

const EvaluatorScoresList = ({ spanId }: EvaluatorScoresListProps) => {
  const { projectId } = useParams();

  const { data: scores } = useSWR<(EvaluatorScore & { evaluatorName: string })[]>(
    `/api/projects/${projectId}/spans/${spanId}/evaluator-scores`,
  swrFetcher
  );

  if (!scores?.length) return null;

  return (
    <div className="flex flex-wrap w-fit items-center gap-2">
      {scores.map((score) => (
        <Tooltip key={score.id}>
          <TooltipTrigger>
            <Badge className="flex gap-1 items-center rounded-3xl" variant="outline">
              <SquareFunction className="w-3 h-3" />
              <span className="text-secondary-foreground">{score.evaluatorName}</span>
              <span>{score.score}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>
              Score is {score.score} recorded by <b>{score.evaluatorName}</b>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      ))}
    </div>
  );
};

export default memo(EvaluatorScoresList);
