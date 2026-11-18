"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import useSWR from "swr";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { flattenFiles } from "@/components/evaluation/task-files/utils";
import { shortHash } from "@/lib/actions/eval-datasets/types";
import { type ArchiveFile, type TaskFilesSource, type TrialTaskFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

import { FILES_SWR_OPTIONS, type TrialFilesTarget } from "./use-trial-files";
import { buildTrialTree, defaultTrialFile } from "./utils";

interface TrialFilesProps {
  target: NonNullable<TrialFilesTarget>;
  failed: boolean;
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const sourceHint = (source: TaskFilesSource | undefined) => {
  if (!source) return "";
  return source.kind === "version"
    ? `task/ is ${source.dataset}/${source.task} at version ${shortHash(source.hash)}`
    : `task/ is ${source.path} from the run's upload`;
};

/**
 * One trial's files as one tree: `task/` (the pushed task version it ran, else
 * the task dir its remote run uploaded), and for remote runs `agent/` (the
 * dataset's agent dir) and `logs/` (its Harbor trial dir, uploaded once the
 * dataset's run ends). The open file is `?file=`, so it stays open across trials.
 */
export default function TrialFiles({ target, failed }: TrialFilesProps) {
  const { hosted, urls, trialName, taskName } = target;
  const task = useSWR<TrialTaskFiles>(urls.task, swrFetcher, FILES_SWR_OPTIONS);
  const agent = useSWR<{ files: ArchiveFile[] }>(hosted ? urls.agent : null, swrFetcher, FILES_SWR_OPTIONS);
  const logs = useSWR<{ files: ArchiveFile[] }>(hosted ? urls.logs : null, swrFetcher, FILES_SWR_OPTIONS);

  const tree = useMemo(
    () =>
      buildTrialTree({
        task: task.data?.files ?? null,
        agent: agent.data?.files ?? null,
        logs: logs.data?.files ?? null,
      }),
    [task.data, agent.data, logs.data]
  );
  const [file, setFile] = useQueryState("file", parseAsString);
  const open = useMemo(() => defaultTrialFile(flattenFiles(tree), { failed, preferred: file }), [tree, failed, file]);

  const notes = [
    task.error && errorText(task.error, "Failed to load the trial's task"),
    hosted && agent.error && errorText(agent.error, "Failed to load the agent dir"),
    hosted && agent.data?.files.length === 0 && "The run's dataset has no agent/ dir.",
    hosted && logs.error && errorText(logs.error, "Failed to load the trial's logs"),
    hosted &&
      !!trialName &&
      logs.data?.files.length === 0 &&
      `The run's uploaded logs have no files for trial ${trialName}.`,
    hosted && !trialName && "This trial has no Harbor trial name, so its logs can't be found.",
    !hosted && "agent/ and logs/ are only kept for remote runs.",
  ].filter((note): note is string => !!note);

  if (task.isLoading || agent.isLoading || logs.isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>{notes.join(" ") || "No files were uploaded for this trial."}</Message>;

  return (
    <FileBrowser
      id="evaluation-trial-files"
      title={taskName ?? trialName ?? "trial"}
      hint={[sourceHint(task.data?.source), trialName].filter(Boolean).join(" · ")}
      notes={notes}
      nodes={tree}
      open={open}
      onSelect={(node) => setFile(node.path)}
      contentUrl={urls.content}
    />
  );
}
