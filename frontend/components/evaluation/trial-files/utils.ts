import { buildFileTree, DEFAULT_FILE, type FileNode } from "@/components/evaluation/task-files/utils";
import { deriveStatus, flattenScores } from "@/components/evaluation/utils";
import { type TrialTaskRef } from "@/lib/actions/evaluation/files";
import { type EvalRow } from "@/lib/evaluation/types";

/** The tree's roots: the trial's task, the run's agent dir, the trial's Harbor output. */
export const TASK_ROOT = "task";
export const AGENT_ROOT = "agent";
export const LOGS_ROOT = "logs";
export type TrialRoot = typeof TASK_ROOT | typeof AGENT_ROOT | typeof LOGS_ROOT;
const ROOTS: TrialRoot[] = [TASK_ROOT, AGENT_ROOT, LOGS_ROOT];

type Files = { path: string; size: number }[];

/**
 * What a failed trial opens on, best first, matched against paths in its
 * logs: logs the dataset's own agent or harness writes (e.g. `run_case.log`),
 * a built-in agent's output (`oracle.txt`, `claude-code.txt`), the traceback,
 * the verifier's output, then Harbor's own trial log.
 */
const FAILURE_FILES = [
  /^agent\/[^/]+\.log$/,
  /^agent\/[^/]+\.txt$/,
  /^exception\.txt$/,
  /^verifier\/test-stdout\.txt$/,
  /^trial\.log$/,
];

/** One tree for a trial, roots in a fixed order; a root that isn't available (null or empty) is left out. */
export const buildTrialTree = (roots: Record<TrialRoot, Files | null>): FileNode[] =>
  ROOTS.flatMap((root) => {
    const files = roots[root];
    if (!files || files.length === 0) return [];
    // Every path starts with `<root>/`, so this is the root's one node.
    return buildFileTree(
      files.map((file) => ({ ...file, path: `${root}/${file.path}` })),
      ""
    );
  });

/** The root a tree path is under and the path below it. */
export const splitTreePath = (path: string): { root: TrialRoot | null; rest: string } => {
  const slash = path.indexOf("/");
  const root = path.slice(0, slash) as TrialRoot;
  return slash > 0 && ROOTS.includes(root) ? { root, rest: path.slice(slash + 1) } : { root: null, rest: path };
};

/**
 * The file a trial opens on: `preferred` (the last opened, maybe in another
 * trial) when this trial has it, else for a failed trial its most telling log,
 * else the task's `instruction.md`, else the first file.
 */
export const defaultTrialFile = (
  files: FileNode[],
  { failed, preferred }: { failed: boolean; preferred?: string | null }
): FileNode | null => {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const kept = preferred ? byPath.get(preferred) : undefined;
  if (kept) return kept;
  if (failed) {
    const logsPrefix = `${LOGS_ROOT}/`;
    const logs = files.filter((file) => file.path.startsWith(logsPrefix));
    for (const pattern of FAILURE_FILES) {
      const file = logs.find((f) => pattern.test(f.path.slice(logsPrefix.length)));
      if (file) return file;
    }
  }
  return byPath.get(`${TASK_ROOT}/${DEFAULT_FILE}`) ?? files[0] ?? null;
};

/** Errored (its trace has an error), or finished with every score 0 or less (Harbor's reward 0). */
export const isFailedTrial = (row: EvalRow | undefined): boolean => {
  if (!row) return false;
  const status = deriveStatus(row);
  // A trial still running reads its missing scores as 0.
  if (status !== "success") return status === "error";
  const fromJson = Object.values(flattenScores(row["scores"]));
  const scores = fromJson.length
    ? fromJson
    : Object.entries(row)
        .filter(([key, value]) => key.startsWith("score:") && typeof value === "number")
        .map(([, value]) => value as number);
  return scores.length > 0 && scores.every((score) => score <= 0);
};

/** The `/files/*` routes of one trial. */
export const trialFilesUrls = (
  projectId: string,
  evaluationId: string,
  ref: TrialTaskRef,
  trialName: string | null
) => {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/files`;
  const taskQuery = new URLSearchParams(
    Object.entries(ref).filter((entry): entry is [string, string] => !!entry[1])
  ).toString();
  const trialQuery = trialName ? `trial=${encodeURIComponent(trialName)}` : null;
  const path = (rest: string) => `path=${encodeURIComponent(rest)}`;
  return {
    task: `${base}/task?${taskQuery}`,
    agent: `${base}/agent`,
    logs: trialQuery && `${base}/logs?${trialQuery}`,
    content: (treePath: string): string => {
      const { root, rest } = splitTreePath(treePath);
      if (root === AGENT_ROOT) return `${base}/agent/content?${path(rest)}`;
      if (root === LOGS_ROOT) return `${base}/logs/content?${trialQuery}&${path(rest)}`;
      return `${base}/task/content?${taskQuery}&${path(rest)}`;
    },
  };
};
