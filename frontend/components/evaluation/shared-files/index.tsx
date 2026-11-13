"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { buildFileTree, type FileNode, flattenFiles, sharedFilesOf } from "@/components/evaluation/task-files/utils";
import { type EvaluationFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

/** Opened first, in this order, when present. */
const DEFAULT_FILES = ["README.md", "lmnr.yaml"];

interface SharedFilesProps {
  projectId: string;
  evaluationId: string;
}

/** The run's shared evals files (images, start/seed scripts, the suite's harbor.yaml and agent): tree + viewer. */
export default function SharedFiles({ projectId, evaluationId }: SharedFilesProps) {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/files`;
  // Same listing (and SWR key) as a trial's task files: one fetch per evaluation, and an upload never changes.
  const { data, error, isLoading } = useSWR<EvaluationFiles>(base, swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  const tree = useMemo(() => (data ? buildFileTree(sharedFilesOf(data.files, data.suitePath), "") : []), [data]);
  const [selected, setSelected] = useState<FileNode | null>(null);

  const open = useMemo(() => {
    if (selected) return selected;
    const flat = flattenFiles(tree);
    for (const path of DEFAULT_FILES) {
      const file = flat.find((f) => f.path === path);
      if (file) return file;
    }
    return flat[0] ?? null;
  }, [selected, tree]);

  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the files"}</Message>;
  if (isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>This run uploaded no shared files.</Message>;

  return (
    <FileBrowser
      id="evaluation-shared-files"
      title="evals"
      hint="Files every trial of this evaluation shares"
      nodes={tree}
      open={open}
      onSelect={setSelected}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
    />
  );
}
