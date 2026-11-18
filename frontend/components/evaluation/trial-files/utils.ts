import { buildFileTree, DEFAULT_FILE, type FileNode } from "@/components/evaluation/task-files/utils";
import { deriveStatus, flattenScores } from "@/components/evaluation/utils";
import { trimDir } from "@/lib/evaluation/trial-files";
import { type EvalRow } from "@/lib/evaluation/types";

/** The tree's second root: the trial's dir in its dataset's Harbor job. Has a space, so no dataset name matches it. */
export const OUTPUT_ROOT = "trial output";

/**
 * What a failed trial opens on, best first, matched against paths in the
 * trial's output: logs the dataset's own agent or harness writes (e.g.
 * `run_case.log`), a built-in agent's output (`oracle.txt`, `claude-code.txt`),
 * the traceback, the verifier's output, then Harbor's own trial log.
 */
const FAILURE_FILES = [
  /^agent\/[^/]+\.log$/,
  /^agent\/[^/]+\.txt$/,
  /^exception\.txt$/,
  /^verifier\/test-stdout\.txt$/,
  /^trial\.log$/,
];

/** The tree's first root, named after the dataset dir (its last segment). */
export const datasetRootOf = (suitePath: string): string => trimDir(suitePath).split("/").pop() || "dataset";

/** The trial's task dir relative to the dataset dir (`tasks/<task>`), or null when it isn't inside it. */
export const taskDirIn = (suitePath: string, taskPath: string | null): string | null => {
  if (!taskPath) return null;
  const root = trimDir(suitePath);
  const task = trimDir(taskPath);
  if (!root) return task || null;
  return task.startsWith(`${root}/`) ? task.slice(root.length + 1) : null;
};

const rootNode = (name: string, files: { path: string; size: number }[]): FileNode => {
  const [node] = buildFileTree(
    files.map((file) => ({ ...file, path: `${name}/${file.path}` })),
    ""
  );
  return node ?? { name, path: name, size: 0, children: [] };
};

/**
 * One tree for a trial: the dataset dir (`datasetFiles`, relative to it) and the
 * trial's output (`outputFiles`, relative to the trial's dir). A null side
 * (not available) is left out.
 */
export const buildTrialTree = (
  datasetRoot: string,
  datasetFiles: { path: string; size: number }[] | null,
  outputFiles: { path: string; size: number }[] | null
): FileNode[] => [
  ...(datasetFiles ? [rootNode(datasetRoot, datasetFiles)] : []),
  ...(outputFiles ? [rootNode(OUTPUT_ROOT, outputFiles)] : []),
];

interface DefaultFileOptions {
  datasetRoot: string;
  /** Relative to the dataset dir (`taskDirIn`). */
  taskDir: string | null;
  failed: boolean;
  /** The file the user opened last, possibly in another trial. */
  preferred?: string | null;
}

/**
 * The file a trial opens on: `preferred` when this trial has it (a file of
 * another trial's task maps to the same file of this one's), else for a failed
 * trial its most telling output, else the task's `instruction.md`.
 */
export const defaultTrialFile = (
  files: FileNode[],
  { datasetRoot, taskDir, failed, preferred }: DefaultFileOptions
): FileNode | null => {
  const byPath = new Map(files.map((file) => [file.path, file]));
  if (preferred) {
    const taskFile = preferred.startsWith(`${datasetRoot}/tasks/`)
      ? preferred
          .slice(datasetRoot.length + "/tasks/".length)
          .split("/")
          .slice(1)
          .join("/")
      : null;
    const kept =
      byPath.get(preferred) ?? (taskDir && taskFile ? byPath.get(`${datasetRoot}/${taskDir}/${taskFile}`) : undefined);
    if (kept) return kept;
  }
  if (failed) {
    const outputPrefix = `${OUTPUT_ROOT}/`;
    const output = files.filter((file) => file.path.startsWith(outputPrefix));
    for (const pattern of FAILURE_FILES) {
      const file = output.find((f) => pattern.test(f.path.slice(outputPrefix.length)));
      if (file) return file;
    }
  }
  const instruction = taskDir ? byPath.get(`${datasetRoot}/${taskDir}/${DEFAULT_FILE}`) : undefined;
  return instruction ?? files[0] ?? null;
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
