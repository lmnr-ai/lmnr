"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { buildFileTree, DEFAULT_FILE, type FileNode, flattenFiles } from "@/components/evaluation/task-files/utils";
import { swrFetcher } from "@/lib/api/fetch-api";
import { type ArchiveFile } from "@/lib/evaluation/trial-files";

interface VersionFilesProps {
  projectId: string;
  datasetId: string;
  taskId: string;
  hash: string;
}

/** A pushed task version's files, `instruction.md` first. */
export default function VersionFiles({ projectId, datasetId, taskId, hash }: VersionFilesProps) {
  const base = `/api/projects/${projectId}/eval-datasets/${encodeURIComponent(datasetId)}/tasks/${encodeURIComponent(taskId)}/versions/${hash}/files`;
  // A version's files never change.
  const { data, error, isLoading } = useSWR<{ files: ArchiveFile[] }>(base, swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  const tree = useMemo(() => (data ? buildFileTree(data.files, "") : []), [data]);
  const [selected, setSelected] = useState<FileNode | null>(null);
  const open = useMemo(() => {
    if (selected) return selected;
    const files = flattenFiles(tree);
    return files.find((f) => f.path === DEFAULT_FILE) ?? files[0] ?? null;
  }, [selected, tree]);

  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the files"}</Message>;
  if (isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>This version has no files.</Message>;

  return (
    <FileBrowser
      id="eval-dataset-version-files"
      title={taskId}
      hint={`${datasetId}/${taskId} version ${hash}`}
      nodes={tree}
      open={open}
      onSelect={setSelected}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
    />
  );
}
