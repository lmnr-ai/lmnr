import { useMemo } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { buildFileTree, DEFAULT_FILE, type FileNode, flattenFiles } from "@/components/evaluation/task-files/utils";
import { shortHash } from "@/lib/actions/eval-datasets/types";
import { type ArchiveFile } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

interface VersionFilesProps {
  /** The version's `/files` route. */
  api: string;
  task: string;
  hash: string;
  /** The open file (`?file=`), kept across tasks and versions that have it. */
  file: string | null;
  onFileChange: (path: string) => void;
}

/** One task version's files; immutable, so the listing is fetched once. */
export default function VersionFiles({ api, task, hash, file, onFileChange }: VersionFilesProps) {
  const { data, error, isLoading } = useSWR<{ files: ArchiveFile[] }>(api, swrFetcher, {
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
  if (!open) return <Message>This task version has no files.</Message>;

  return (
    <FileBrowser
      id="eval-dataset-task-files"
      title={shortHash(hash)}
      hint={`${task} @ ${hash}`}
      nodes={tree}
      open={open}
      onSelect={(node) => onFileChange(node.path)}
      contentUrl={(path) => `${api}/content?path=${encodeURIComponent(path)}`}
    />
  );
}
