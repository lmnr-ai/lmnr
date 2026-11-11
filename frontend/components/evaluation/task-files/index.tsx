"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { type EvaluationFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

import FileBrowser from "./file-browser";
import Message from "./message";
import { defaultFile, type FileNode, trialFileTree } from "./utils";

interface TaskFilesProps {
  projectId: string;
  evaluationId: string;
  /** The trial's task dir in the uploaded evals folder; null when it wasn't uploaded. */
  taskPath: string | null;
  /** Shown above the tree; the dir's last segment when the trial has none. */
  taskName: string | null;
}

/**
 * The files the trial ran with, from the evals folder its remote run uploaded:
 * its suite with only this task, file tree on the left, the open file on the
 * right. Mount with `key={taskPath}` so switching tasks reopens the default file.
 */
export default function TaskFiles({ projectId, evaluationId, taskPath, taskName }: TaskFilesProps) {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/files`;
  // One listing per evaluation, shared by every trial's task; an uploaded folder never changes.
  const { data, error, isLoading } = useSWR<EvaluationFiles>(base, swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  const tree = useMemo(
    () => (data && taskPath ? trialFileTree(data.files, data.suitePath, taskPath) : null),
    [data, taskPath]
  );
  const [selected, setSelected] = useState<FileNode | null>(null);
  const open = useMemo(() => selected ?? (tree ? defaultFile(tree) : null), [selected, tree]);

  if (!taskPath) {
    return (
      <Message>This trial&apos;s task wasn&apos;t uploaded with the run, so its files can&apos;t be shown.</Message>
    );
  }
  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the files"}</Message>;
  if (isLoading) return <Message>Loading files…</Message>;
  if (!tree || !open) return <Message>{`No files found in ${taskPath}`}</Message>;

  return (
    <FileBrowser
      id="evaluation-task-files"
      // The tree starts at the suite unless the task lives outside it.
      title={tree.taskDir ? tree.root.split("/").pop()! : (taskName ?? taskPath.split("/").pop() ?? taskPath)}
      hint={tree.root}
      nodes={tree.nodes}
      open={open}
      onSelect={setSelected}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(`${tree.root}/${path}`)}`}
    />
  );
}
