"use client";

import { shortHash, versionLabel } from "@/components/task-sets/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type TaskSetDetail } from "@/lib/actions/task-sets/types";
import { formatTimestamp } from "@/lib/utils";

import { useTaskSetTab, useVersionParam } from "./state";

/** Every version of the task set, newest first, with what it changed against its parent. */
export default function VersionsTab({ taskSet }: { taskSet: TaskSetDetail }) {
  const [, setTab] = useTaskSetTab();
  const [, setVersion] = useVersionParam();

  const open = (versionId: string) => {
    void setVersion(versionId);
    void setTab("tasks");
  };

  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Version</TableHead>
            <TableHead className="w-28">Hash</TableHead>
            <TableHead className="w-24">Tasks</TableHead>
            <TableHead>Changes vs parent</TableHead>
            <TableHead className="w-48">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {taskSet.versions.map((v) => (
            <TableRow key={v.id} className="cursor-pointer" onClick={() => open(v.id)}>
              <TableCell className="font-medium">
                {versionLabel(v.number)}
                {v.id === taskSet.headVersionId && <span className="ml-2 text-xs text-primary-text">head</span>}
              </TableCell>
              <TableCell className="font-mono text-xs text-secondary-foreground">{shortHash(v.hash)}</TableCell>
              <TableCell className="text-secondary-foreground">{v.taskCount}</TableCell>
              <TableCell className="text-xs">
                <span className="text-green-600 dark:text-green-500">+{v.added}</span>
                <span className="ml-2 text-destructive-text">−{v.removed}</span>
                <span className="ml-2 text-amber-600 dark:text-amber-500">~{v.changed}</span>
              </TableCell>
              <TableCell className="text-secondary-foreground">{formatTimestamp(v.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
