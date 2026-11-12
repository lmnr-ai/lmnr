"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { buildFileTree, type FileNode, flattenFiles } from "@/components/evaluation/task-files/utils";
import { type TrialLogFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

import { defaultLogFile } from "./utils";

interface TrialLogProps {
  projectId: string;
  evaluationId: string;
  /** Harbor's trial name: the trial's dir in its suite's job. */
  trialName: string | null;
}

/**
 * The trial's dir in the Harbor job its remote run uploaded once the suite
 * ended. Mount with `key={trialName}` so switching trials reopens the
 * default file.
 */
export default function TrialLog({ projectId, evaluationId, trialName }: TrialLogProps) {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/logs`;
  const trialQuery = trialName ? `trial=${encodeURIComponent(trialName)}` : null;
  const { data, error, isLoading } = useSWR<TrialLogFiles>(trialQuery && `${base}?${trialQuery}`, swrFetcher, {
    revalidateOnFocus: false,
  });
  const tree = useMemo(() => (data ? buildFileTree(data.files, "") : []), [data]);
  const [selected, setSelected] = useState<FileNode | null>(null);
  const open = useMemo(() => selected ?? defaultLogFile(flattenFiles(tree)), [selected, tree]);

  const contentUrl = (path: string) => `${base}/content?${trialQuery}&path=${encodeURIComponent(path)}`;

  if (!trialName) return <Message>This trial has no Harbor trial name, so its logs can&apos;t be found.</Message>;
  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the logs"}</Message>;
  if (isLoading) return <Message>Loading logs…</Message>;
  if (!open) return <Message>{`No logs were uploaded for ${trialName}`}</Message>;

  return (
    <FileBrowser
      id="evaluation-trial-log"
      title={trialName}
      nodes={tree}
      open={open}
      onSelect={setSelected}
      contentUrl={contentUrl}
    />
  );
}
