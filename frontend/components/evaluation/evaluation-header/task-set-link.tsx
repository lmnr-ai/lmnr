"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { versionLabel } from "@/components/task-sets/utils";
import { type TaskSetLink as TaskSetLinkType } from "@/lib/actions/task-sets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

interface TaskSetLinkProps {
  projectId: string;
  taskSetVersionId: string;
}

/** The task set (and version) an evaluation ran, linking to it. */
export default function TaskSetLink({ projectId, taskSetVersionId }: TaskSetLinkProps) {
  const { data } = useSWR<TaskSetLinkType>(
    `/api/projects/${projectId}/task-set-versions/${taskSetVersionId}`,
    swrFetcher,
    { revalidateOnFocus: false }
  );
  if (!data) return null;

  return (
    <Link
      href={`/project/${projectId}/task-sets/${data.taskSetId}?version=${taskSetVersionId}`}
      className="flex flex-none items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs text-secondary-foreground hover:overlay-hover"
      title="Task set this evaluation ran"
    >
      <ListChecks className="size-3.5" />
      <span className="max-w-64 truncate">{data.taskSetName}</span>
      <span>{versionLabel(data.versionNumber)}</span>
    </Link>
  );
}
