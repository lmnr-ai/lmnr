import { Database } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { nameToPath } from "@/lib/evaluation/trial-files";

interface EvalDatasetLinkProps {
  projectId: string;
  /** The eval dataset's name (`org/name`). */
  dataset: string;
}

/** Links an evaluation to the eval dataset its run used. */
const EvalDatasetLink = ({ projectId, dataset }: EvalDatasetLinkProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="outline" className="h-7 gap-1.5 px-2 text-xs min-w-0 max-w-64" asChild>
        <Link href={`/project/${projectId}/eval-datasets/${nameToPath(dataset)}`}>
          <Database className="size-3.5 shrink-0" />
          <span className="truncate">{dataset}</span>
        </Link>
      </Button>
    </TooltipTrigger>
    <TooltipContent>The eval dataset this run used</TooltipContent>
  </Tooltip>
);

export default EvalDatasetLink;
