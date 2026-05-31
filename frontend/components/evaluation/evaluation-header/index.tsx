import { Edit, Ellipsis, Trash } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo } from "react";

import DeleteEvaluationDialog from "@/components/evaluation/delete-evaluation-dialog";
import ShareEvalButton from "@/components/evaluation/evaluation-header/share-eval-button";
import { AggregationSelect } from "@/components/evaluation/metrics-panel/aggregation-select";
import RenameEvaluationDialog from "@/components/evaluation/rename-evaluation-dialog";
import { Button } from "@/components/ui/button";
import DownloadButton from "@/components/ui/download-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface EvaluationHeader {
  name?: string;
  urlKey: string;
  hasNonBinary?: boolean;
}

const EvaluationHeader = ({ name, urlKey, hasNonBinary }: EvaluationHeader) => {
  const { projectId, evaluationId } = useParams();

  return (
    <div className="flex-none flex gap-2 px-4 items-center justify-between w-full">
      <AggregationSelect hidden={!hasNonBinary} />
      <div className="flex items-center gap-2">
        <DownloadButton
          uri={`/api/projects/${projectId}/evaluations/${evaluationId}/download`}
          filenameFallback={`evaluation-results-${evaluationId}`}
          supportedFormats={["csv", "json"]}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="h-7 w-7 p-0">
              <Ellipsis className="w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <RenameEvaluationDialog defaultValue={name} urlKey={urlKey}>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Edit className="size-3.5" />
                <span className="text-xs">Rename</span>
              </DropdownMenuItem>
            </RenameEvaluationDialog>
            <DeleteEvaluationDialog>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Trash className="size-3.5 text-destructive" />
                <span className="text-destructive text-xs">Delete</span>
              </DropdownMenuItem>
            </DeleteEvaluationDialog>
          </DropdownMenuContent>
        </DropdownMenu>
        {typeof evaluationId === "string" && typeof projectId === "string" && (
          <ShareEvalButton evaluationId={evaluationId} projectId={projectId} />
        )}
      </div>
    </div>
  );
};

export default memo(EvaluationHeader);
