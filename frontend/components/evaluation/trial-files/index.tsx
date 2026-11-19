"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

import FileBrowser from "@/components/evaluation/task-files/file-browser";
import Message from "@/components/evaluation/task-files/message";
import { flattenFiles } from "@/components/evaluation/task-files/utils";
import { shortHash } from "@/lib/actions/eval-datasets/types";
import { type TrialFiles as TrialFilesListing, type TrialTaskSource } from "@/lib/evaluation/trial-files";

import { buildTrialTree, defaultTrialFile } from "./utils";

const LOGS_PENDING = "Logs arrive once the evaluation run finishes.";

/** The task is what a trial is read for; the run's agent/ and logs/ start collapsed. */
const INITIALLY_COLLAPSED = ["agent", "logs"];

const taskHint = (task: TrialTaskSource | null): string => {
  if (!task) return "No task folder";
  if (task.source === "dataset") return `task/: ${task.task} version ${shortHash(task.hash)} in ${task.dataset}`;
  return `task/: ${task.path}, uploaded with the run (this version isn't in the dataset)`;
};

interface TrialFilesProps {
  projectId: string;
  evaluationId: string;
  trialId: string;
  /** The trial's listing; undefined while it loads. */
  listing: TrialFilesListing | undefined;
  error: string | null;
  /** Shown above the tree. */
  title: string;
}

/**
 * The trial's files in one tree: `task/` (its task version, else the copy its
 * remote run uploaded), and for remote runs `agent/` and `logs/` (its Harbor
 * trial dir). The open file is `?file=`, so it stays open across trials that
 * have it (and in links); other trials open their best default.
 */
export default function TrialFiles({ projectId, evaluationId, trialId, listing, error, title }: TrialFilesProps) {
  const tree = useMemo(() => (listing ? buildTrialTree(listing.files) : []), [listing]);
  const [file, setFile] = useQueryState("file", parseAsString);
  const open = useMemo(() => defaultTrialFile(flattenFiles(tree), file), [file, tree]);

  if (error) return <Message>{error}</Message>;
  if (!listing) return <Message>Loading files…</Message>;
  if (!open) {
    return (
      <Message>
        {listing.logsPending
          ? `This trial has no files yet. ${LOGS_PENDING}`
          : "This trial has no files: its task wasn't uploaded or pushed, and it has no logs."}
      </Message>
    );
  }

  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/trials/${trialId}/files`;
  return (
    <FileBrowser
      id="evaluation-trial-files"
      title={title}
      hint={taskHint(listing.task)}
      nodes={tree}
      open={open}
      onSelect={(node) => setFile(node.path)}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
      note={listing.logsPending ? LOGS_PENDING : undefined}
      initiallyCollapsed={INITIALLY_COLLAPSED}
    />
  );
}
