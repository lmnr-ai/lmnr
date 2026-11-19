"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type EvalDataset } from "@/lib/actions/eval-datasets/types";

import TaskRows from "./task-rows";
import VersionFilesDialog from "./version-files-dialog";

interface EvalDatasetViewProps {
  projectId: string;
  dataset: EvalDataset;
}

/**
 * One eval dataset: each task's latest version and, expanded, every version
 * newest first. The version whose files are open is `?task=&hash=`.
 */
export default function EvalDatasetView({ projectId, dataset }: EvalDatasetViewProps) {
  const [open, setOpen] = useQueryStates({ task: parseAsString, hash: parseAsString });
  const onOpenVersion = useCallback((task: string, hash: string) => setOpen({ task, hash }), [setOpen]);
  const onClose = useCallback(() => setOpen({ task: null, hash: null }), [setOpen]);

  return (
    <>
      <Header
        path={[
          { name: "eval datasets", href: `/project/${projectId}/eval-datasets` },
          { name: dataset.id, copyValue: dataset.id, className: "min-w-0" },
        ]}
      >
        <Button variant="outline" className="ml-auto gap-2" asChild>
          {/* A run's evaluation group is its dataset's name. */}
          <Link href={`/project/${projectId}/evaluations?groupId=${encodeURIComponent(dataset.id)}`}>
            <FlaskConical className="size-3.5" />
            View runs
          </Link>
        </Button>
      </Header>
      <div className="flex flex-1 flex-col gap-4 overflow-auto px-4 pb-4">
        <div className="rounded-md border bg-surface-up">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">Task</TableHead>
                <TableHead className="px-3">Version</TableHead>
                <TableHead className="px-3">Pushed</TableHead>
                <TableHead className="px-3">Versions</TableHead>
                <TableHead className="px-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataset.tasks.map((task) => (
                <TaskRows key={task.id} task={task} onOpenVersion={onOpenVersion} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {open.task && open.hash && (
        <VersionFilesDialog
          projectId={projectId}
          datasetId={dataset.id}
          taskId={open.task}
          hash={open.hash}
          onClose={onClose}
        />
      )}
    </>
  );
}
