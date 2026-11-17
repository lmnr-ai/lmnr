"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";
import { type ArchiveFile } from "@/lib/hosted-evals/types";

import FileBrowser from "./file-browser";
import Message from "./message";
import { buildFileTree, DEFAULT_FILE, type FileNode, flattenFiles } from "./utils";

interface ArchiveFolderProps {
  /** Prefix for the resizable panels' ids. */
  id: string;
  /** Lists the archive: `{files}` with paths relative to its root. */
  listUrl: string;
  /** Where the file at `path` (relative to the archive root) is downloaded from. */
  contentUrl: (path: string) => string;
  /** The folder to show, relative to the archive root; `""` for all of it. */
  root: string;
  title: string;
  /** Opened first when the folder has it. */
  defaultFile?: string;
}

/**
 * One folder of a hosted-evals archive (a task-set or agent-scripts version):
 * file tree on the left, the open file on the right. Mount with `key={root}` so
 * switching folders reopens the default file.
 */
export default function ArchiveFolder({
  id,
  listUrl,
  contentUrl,
  root,
  title,
  defaultFile = DEFAULT_FILE,
}: ArchiveFolderProps) {
  // An archive never changes, so one listing serves every folder in it.
  const { data, error, isLoading } = useSWR<{ files: ArchiveFile[] }>(listUrl, swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  const tree = useMemo(() => (data ? buildFileTree(data.files, root) : []), [data, root]);
  const [selected, setSelected] = useState<FileNode | null>(null);

  const open = useMemo(() => {
    if (selected) return selected;
    const files = flattenFiles(tree);
    return files.find((f) => f.path === defaultFile) ?? files[0] ?? null;
  }, [selected, tree, defaultFile]);

  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the files"}</Message>;
  if (isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>{root ? `No files found in ${root}` : "No files found"}</Message>;

  return (
    <FileBrowser
      id={id}
      title={title}
      hint={root || title}
      nodes={tree}
      open={open}
      onSelect={setSelected}
      contentUrl={(path) => contentUrl(root ? `${root}/${path}` : path)}
    />
  );
}
