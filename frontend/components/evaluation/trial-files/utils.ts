import { buildFileTree, DEFAULT_FILE, type FileNode } from "@/components/evaluation/task-files/utils";
import { TRIAL_FILE_ROOTS, type TrialFiles } from "@/lib/evaluation/trial-files";
import { type EvalRow } from "@/lib/evaluation/types";
import { tryParseJson } from "@/lib/utils";

import { defaultLogFile } from "./log-files";

const metadataString = (row: EvalRow | undefined, key: string): string | null => {
  const raw = row?.["metadata"];
  const metadata = typeof raw === "string" ? tryParseJson(raw) : raw;
  const value = (metadata as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "string" && value ? value : null;
};

/** The trial's task inside its eval dataset (`metadata.dataset_task`); null when unset. */
export const datasetTaskOf = (row: EvalRow | undefined): string | null => metadataString(row, "dataset_task");

/** The trial's task, as the table's Task column shows it; null when unset. */
export const taskNameOf = (row: EvalRow | undefined): string | null => {
  const taskId = row?.["taskId"];
  return typeof taskId === "string" && taskId ? taskId : null;
};

/**
 * Whether a local run's trial can have a pushed task version: its evaluation
 * names a dataset and the trial a dataset task and a hash. A row from the
 * realtime stream may lack `taskVersionHash`; only an empty one rules it out.
 */
export const mayHaveTaskVersion = (row: EvalRow | undefined, datasetV2Id: string | null | undefined): boolean =>
  !!row && !!datasetV2Id && row["taskVersionHash"] !== "" && !!metadataString(row, "dataset_task");

/** One tree with the roots in panel order (`task/`, `agent/`, `logs/`); paths keep their root. */
export const buildTrialTree = (files: { path: string; size: number }[]): FileNode[] => {
  const order = (node: FileNode) => (TRIAL_FILE_ROOTS as readonly string[]).indexOf(node.name);
  return buildFileTree(files, "")
    .filter((node) => node.children && order(node) >= 0)
    .sort((a, b) => order(a) - order(b));
};

/**
 * The file a trial opens on: `preferred` (the file open in the previous trial)
 * when this trial has it, else the task's instruction, else the best log, else
 * the first file.
 */
export const defaultTrialFile = <T extends { path: string }>(files: T[], preferred?: string | null): T | null => {
  const kept = preferred ? files.find((f) => f.path === preferred) : undefined;
  if (kept) return kept;
  const instruction = files.find((f) => f.path === `task/${DEFAULT_FILE}`);
  if (instruction) return instruction;
  const logs = files.filter((f) => f.path.startsWith("logs/")).map((f) => ({ file: f, path: f.path.slice(5) }));
  return defaultLogFile(logs)?.file ?? files[0] ?? null;
};

export type FilesAvailability = "available" | "unavailable" | "loading";

/**
 * Whether a trial offers Files. Remote runs always do (except on shared evals:
 * the routes need a project session). A local run only once its listing found
 * the trial's pushed task version. `listing` is this trial's: undefined while
 * loading, null when it failed.
 */
export const filesAvailability = ({
  isShared,
  isHosted,
  canLookUp,
  listing,
}: {
  isShared: boolean;
  isHosted: boolean;
  canLookUp: boolean;
  listing: TrialFiles | null | undefined;
}): FilesAvailability => {
  if (isShared) return "unavailable";
  if (isHosted) return "available";
  if (!canLookUp || listing === null) return "unavailable";
  if (listing === undefined) return "loading";
  return listing.task?.source === "dataset" ? "available" : "unavailable";
};

/** While a trial's listing loads, the toggle keeps what the previous trial showed, so it doesn't flicker. */
export const showFilesToggle = (availability: FilesAvailability, previous: TrialFiles | undefined): boolean =>
  availability === "available" || (availability === "loading" && previous?.task?.source === "dataset");
