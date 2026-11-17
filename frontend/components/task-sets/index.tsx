"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type TaskSetSummary } from "@/lib/actions/task-sets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import EmptyState from "./empty-state";
import TaskSetRow from "./task-set-row";

/** Every task set of the project, by name. */
export default function TaskSets() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data, error, isLoading, mutate } = useSWR<TaskSetSummary[]>(
    `/api/projects/${projectId}/task-sets`,
    swrFetcher
  );

  return (
    <>
      <Header path="task sets" />
      <div className="flex flex-1 flex-col gap-6 overflow-auto px-4 pb-4">
        {error && (
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load task sets"}
          </div>
        )}
        {isLoading && <div className="text-sm text-secondary-foreground">Loading task sets…</div>}
        {data?.length === 0 && <EmptyState />}
        {!!data?.length && (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task set</TableHead>
                  <TableHead className="w-28">Version</TableHead>
                  <TableHead className="w-28">Tasks</TableHead>
                  <TableHead className="w-48">Last run</TableHead>
                  <TableHead className="w-48">Updated</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((taskSet) => (
                  <TaskSetRow key={taskSet.id} projectId={projectId} taskSet={taskSet} onDeleted={() => mutate()} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
