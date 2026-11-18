"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { flattenFiles } from "@/components/evaluation/task-files/utils";
import { type EvaluationFiles, type TrialOutputFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";
import { trimDir } from "@/lib/evaluation/trial-files";

import { buildTrialTree, datasetRootOf, defaultTrialFile, OUTPUT_ROOT, taskDirIn } from "./utils";

interface TrialFilesProps {
  projectId: string;
  evaluationId: string;
  /** The run's dataset dir in the uploaded evals folder (`hostedMetadata.suitePath`). */
  suitePath: string;
  /** The trial's task dir in the uploaded evals folder; null when it wasn't uploaded. */
  taskPath: string | null;
  /** Harbor's trial name: the trial's dir in its dataset's job. */
  trialName: string | null;
  /** Shown above the tree. */
  taskName: string | null;
  failed: boolean;
}

const SWR_OPTIONS = { revalidateOnFocus: false, shouldRetryOnError: false };

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * One trial's files from its remote run: the dataset dir with only this trial's
 * task, and the trial's Harbor output (uploaded once the dataset's run ends).
 * The open file is `?file=`, so it stays open across trials that have it.
 */
export default function TrialFiles(props: TrialFilesProps) {
  const { projectId, evaluationId, suitePath, taskPath, trialName, taskName, failed } = props;
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}`;
  const trialQuery = trialName ? `trial=${encodeURIComponent(trialName)}` : null;
  const dataset = useSWR<EvaluationFiles>(
    `${base}/files?task=${encodeURIComponent(taskPath ?? "")}`,
    swrFetcher,
    SWR_OPTIONS
  );
  const output = useSWR<TrialOutputFiles>(trialQuery && `${base}/output?${trialQuery}`, swrFetcher, SWR_OPTIONS);

  const datasetRoot = datasetRootOf(suitePath);
  const taskDir = taskDirIn(suitePath, taskPath);
  const tree = useMemo(
    () => buildTrialTree(datasetRoot, dataset.data?.files ?? null, output.data?.files ?? null),
    [datasetRoot, dataset.data, output.data]
  );
  const [file, setFile] = useQueryState("file", parseAsString);
  const open = useMemo(
    () => defaultTrialFile(flattenFiles(tree), { datasetRoot, taskDir, failed, preferred: file }),
    [tree, datasetRoot, taskDir, failed, file]
  );

  const notes = [
    dataset.error && errorText(dataset.error, "Failed to load the dataset's files"),
    !taskPath && "This trial's task wasn't uploaded with the run.",
    output.error && errorText(output.error, "Failed to load the trial's output"),
    !trialName && "This trial has no Harbor trial name, so its output can't be found.",
  ].filter((note): note is string => !!note);

  if (dataset.isLoading || output.isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>{notes.join(" ") || "No files were uploaded for this trial."}</Message>;

  const contentUrl = (path: string) => {
    if (path.startsWith(`${OUTPUT_ROOT}/`)) {
      return `${base}/output/content?${trialQuery}&path=${encodeURIComponent(path.slice(OUTPUT_ROOT.length + 1))}`;
    }
    const inDataset = path.slice(datasetRoot.length + 1);
    const root = trimDir(suitePath);
    return `${base}/files/content?path=${encodeURIComponent(root ? `${root}/${inDataset}` : inDataset)}`;
  };

  return (
    <FileBrowser
      id="evaluation-trial-files"
      title={taskName ?? trialName ?? datasetRoot}
      hint={[taskPath, trialName].filter(Boolean).join(" · ")}
      notes={notes}
      nodes={tree}
      open={open}
      onSelect={(node) => setFile(node.path)}
      contentUrl={contentUrl}
    />
  );
}
