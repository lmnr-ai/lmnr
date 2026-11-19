"use client";

import { useMemo } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { buildFileTree, DEFAULT_FILE, flattenFiles } from "@/components/evaluation/task-files/utils";
import { swrFetcher } from "@/lib/api/fetch-api";
import { type ArchiveFile, nameToPath } from "@/lib/evaluation/trial-files";

interface VersionFilesProps {
  projectId: string;
  datasetId: string;
  taskId: string;
  hash: string;
  /** The file to open; falls back to `instruction.md` when this version doesn't have it. */
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
}

/** A pushed task version's files, `instruction.md` first. */
export default function VersionFiles({
  projectId,
  datasetId,
  taskId,
  hash,
  selectedPath,
  onSelectPath,
}: VersionFilesProps) {
  const base = `/api/projects/${projectId}/eval-datasets/${nameToPath(datasetId)}/tasks/${nameToPath(taskId)}/versions/${hash}/files`;
  // A version's files never change.
  const { data, error, isLoading } = useSWR<{ files: ArchiveFile[] }>(base, swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  const tree = useMemo(() => (data ? buildFileTree(data.files, "") : []), [data]);
  const open = useMemo(() => {
    const files = flattenFiles(tree);
    return files.find((f) => f.path === selectedPath) ?? files.find((f) => f.path === DEFAULT_FILE) ?? files[0] ?? null;
  }, [selectedPath, tree]);

  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the files"}</Message>;
  if (isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>This version has no files.</Message>;

  return (
    <FileBrowser
      id="eval-dataset-version-files"
      title={taskId}
      hint={`${taskId} version ${hash} in ${datasetId}`}
      nodes={tree}
      open={open}
      onSelect={(node) => onSelectPath(node.path)}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
    />
  );
}
