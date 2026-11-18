import { useMemo } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { buildFileTree, DEFAULT_FILE, type FileNode, flattenFiles } from "@/components/evaluation/task-files/utils";
import { taskHashHex } from "@/lib/actions/eval-datasets/types";
import { type ArchiveFile } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

interface TaskFilesProps {
  projectId: string;
  task: string;
  /** `sha256:<hex>` */
  hash: string;
  /** The open file (`?file=`), kept across tasks that have it. */
  file: string | null;
  onFileChange: (path: string) => void;
}

/** One pushed task's files; content addressed, so the listing never changes. */
export default function TaskFiles({ projectId, task, hash, file, onFileChange }: TaskFilesProps) {
  const base = `/api/projects/${projectId}/eval-dataset-tasks/${taskHashHex(hash)}/files`;
  const { data, error, isLoading } = useSWR<{ files: ArchiveFile[] }>(base, swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });
  const tree = useMemo(() => (data ? buildFileTree(data.files, "") : []), [data]);
  const open = useMemo((): FileNode | null => {
    const files = flattenFiles(tree);
    return files.find((f) => f.path === file) ?? files.find((f) => f.path === DEFAULT_FILE) ?? files[0] ?? null;
  }, [tree, file]);

  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the task's files"}</Message>;
  if (isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>This task has no files.</Message>;

  return (
    <FileBrowser
      id="eval-dataset-task-files"
      title={task}
      hint={hash}
      nodes={tree}
      open={open}
      onSelect={(node) => onFileChange(node.path)}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
    />
  );
}
