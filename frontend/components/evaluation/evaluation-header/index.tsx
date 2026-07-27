import { ArrowRight, Download, Edit, Ellipsis, Trash } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { memo } from "react";

import { AgentHeaderToggle } from "@/components/agent";
import DeleteEvaluationDialog from "@/components/evaluation/delete-evaluation-dialog";
import ShareEvalButton from "@/components/evaluation/evaluation-header/share-eval-button";
import RenameEvaluationDialog from "@/components/evaluation/rename-evaluation-dialog";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/components/ui/download-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { formatTimestamp } from "@/lib/utils";

interface EvaluationHeader {
  evaluations: EvaluationType[];
  name?: string;
  urlKey: string;
}

const DOWNLOAD_FORMATS = ["csv", "json"] as const;

const EvaluationHeader = ({ evaluations, name, urlKey }: EvaluationHeader) => {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId, evaluationId } = useParams();
  const router = useRouter();
  const targetId = searchParams.get("targetId");

  const handleChange = (value?: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("targetId", value);
    } else {
      params.delete("targetId");
    }
    router.push(`${pathName}?${params}`);
  };

  return (
    <div className="font-medium flex-none flex gap-2 items-center justify-between w-full h-12 pl-2.5 pr-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="hover:bg-secondary size-7" />
        <Link
          href={`/project/${projectId}/evaluations`}
          className="hover:bg-muted rounded-lg px-2 p-0.5 text-secondary-foreground"
        >
          evaluations
        </Link>
        <div className="text-secondary-foreground/40">/</div>
        <div>
          <Select key={targetId} value={targetId ?? undefined} onValueChange={handleChange}>
            <SelectTrigger disabled={evaluations.length <= 1} className="flex font-medium truncate">
              <SelectValue placeholder="Select compared evaluation" />
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter((item) => item.id !== evaluationId)
                .map((item) => (
                  <SelectItem className="truncate" key={item.id} value={item.id}>
                    <span>
                      {item.name}
                      <span className="text-secondary-foreground text-xs ml-2">{formatTimestamp(item.createdAt)}</span>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-none text-secondary-foreground">
          <ArrowRight size={16} />
        </div>
        <div>
          <Select
            key={String(evaluationId)}
            value={String(evaluationId)}
            onValueChange={(value) => {
              router.push(`/project/${projectId}/evaluations/${value}?${searchParams.toString()}`);
            }}
          >
            <SelectTrigger className="flex font-medium">
              <SelectValue placeholder="Select evaluation" />
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter((item) => item.id !== targetId)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span>
                      {item.name}
                      <span className="text-secondary-foreground text-xs ml-2">{formatTimestamp(item.createdAt)}</span>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {targetId && (
          <Button variant="outline" onClick={() => handleChange(undefined)}>
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="More options" variant="secondary" className="h-7 w-7 p-0">
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
            {DOWNLOAD_FORMATS.map((format) => (
              <DropdownMenuItem
                key={format}
                onClick={() =>
                  downloadFile(
                    `/api/projects/${projectId}/evaluations/${evaluationId}/download/${format}`,
                    `evaluation-results-${evaluationId}.${format}`,
                    format
                  )
                }
              >
                <Download className="size-3.5" />
                <span className="text-xs">Download as {format.toUpperCase()}</span>
              </DropdownMenuItem>
            ))}
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
        <AgentHeaderToggle />
      </div>
    </div>
  );
};

export default memo(EvaluationHeader);
