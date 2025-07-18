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

  const { data: scores } = useSWR<EvaluatorScore[]>(
    `/api/projects/${projectId}/spans/${spanId}/evaluator-scores`,
    swrFetcher
  );

  if (!scores?.length) return null;

  return (
    <div className="flex flex-wrap w-fit items-center gap-2">
      {scores.map((score) => (
        <Tooltip key={score.id}>
          <TooltipTrigger>
            <Badge className="flex gap-1 items-center rounded-3xl overflow-hidden" variant="outline">
              <SquareFunction className="w-3 h-3 min-w-3 min-h-3" />
              <span className="text-secondary-foreground max-w-10 truncate">{score.name}</span>
              <span className="truncate min-w-0">{score.score.toFixed(2)}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>
              Score <b>{score.score}</b> - <b>{score.name}</b>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      ))}
    </div>
  );
};

export default memo(EvaluatorScoresList);
