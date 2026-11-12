"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { buildFileTree, flattenFiles } from "@/components/evaluation/task-files/utils";
import { type TrialLogFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

import { defaultLogFile } from "./utils";

interface TrialLogProps {
  projectId: string;
  evaluationId: string;
  /** Harbor's trial name: the trial's dir in its suite's job. */
  trialName: string | null;
  /** Shown above the tree; the trial name when the trial has none. */
  taskName: string | null;
}

/**
 * The trial's dir in the Harbor job its remote run uploaded once the suite
 * ended. The open file is `?logFile=`, so it stays open across trials that
 * have it (and in links); other trials open their best default.
 */
export default function TrialLog({ projectId, evaluationId, trialName, taskName }: TrialLogProps) {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/logs`;
  const trialQuery = trialName ? `trial=${encodeURIComponent(trialName)}` : null;
  const { data, error, isLoading } = useSWR<TrialLogFiles>(trialQuery && `${base}?${trialQuery}`, swrFetcher, {
    revalidateOnFocus: false,
  });
  const tree = useMemo(() => (data ? buildFileTree(data.files, "") : []), [data]);
  const [logFile, setLogFile] = useQueryState("logFile", parseAsString);
  const open = useMemo(() => defaultLogFile(flattenFiles(tree), logFile), [logFile, tree]);

  const contentUrl = (path: string) => `${base}/content?${trialQuery}&path=${encodeURIComponent(path)}`;

  if (!trialName) return <Message>This trial has no Harbor trial name, so its logs can&apos;t be found.</Message>;
  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the logs"}</Message>;
  if (isLoading) return <Message>Loading logs…</Message>;
  if (!open) return <Message>{`No logs were uploaded for ${trialName}`}</Message>;

  return (
    <FileBrowser
      id="evaluation-trial-log"
      title={taskName ?? trialName}
      hint={trialName}
      nodes={tree}
      open={open}
      onSelect={(node) => setLogFile(node.path)}
      contentUrl={contentUrl}
    />
  );
}
