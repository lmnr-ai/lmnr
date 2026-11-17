"use client";

import Link from "next/link";
import useSWR from "swr";

import { versionLabel } from "@/components/task-sets/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type TaskSetRun } from "@/lib/actions/task-sets/types";
import { swrFetcher } from "@/lib/api/fetch-api";
import { formatTimestamp } from "@/lib/utils";

interface RunsTabProps {
  projectId: string;
  taskSetId: string;
}

/** The evaluations that ran any version of the task set, newest first. */
export default function RunsTab({ projectId, taskSetId }: RunsTabProps) {
  const { data, error, isLoading } = useSWR<TaskSetRun[]>(
    `/api/projects/${projectId}/task-sets/${taskSetId}/runs`,
    swrFetcher
  );

  if (error) return <div className="text-sm text-destructive">Failed to load runs</div>;
  if (isLoading) return <div className="text-sm text-secondary-foreground">Loading runs…</div>;
  if (!data?.length)
    return <div className="text-sm text-secondary-foreground">No evaluation has run this task set yet.</div>;

  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Evaluation</TableHead>
            <TableHead className="w-56">Group</TableHead>
            <TableHead className="w-32">Version</TableHead>
            <TableHead className="w-48">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <Link href={`/project/${projectId}/evaluations/${run.id}`} className="font-medium hover:underline">
                  {run.name}
                </Link>
              </TableCell>
              <TableCell className="text-secondary-foreground">{run.groupId}</TableCell>
              <TableCell className="text-secondary-foreground">{versionLabel(run.versionNumber)}</TableCell>
              <TableCell className="text-secondary-foreground">{formatTimestamp(run.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
