import { type EvalDatasetTask } from "@/lib/actions/eval-datasets/types";

export type TaskChange = "added" | "removed" | "changed";

export interface TaskDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** What `version` changed relative to `base`, by task name and content hash; names sorted. */
export const diffTasks = (version: EvalDatasetTask[], base: EvalDatasetTask[]): TaskDiff => {
  const baseHashes = new Map(base.map((task) => [task.name, task.hash]));
  const names = new Set(version.map((task) => task.name));
  const diff: TaskDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const task of version) {
    const baseHash = baseHashes.get(task.name);
    if (baseHash === undefined) diff.added.push(task.name);
    else if (baseHash !== task.hash) diff.changed.push(task.name);
    else diff.unchanged++;
  }
  diff.removed = base.filter((task) => !names.has(task.name)).map((task) => task.name);
  for (const list of [diff.added, diff.removed, diff.changed]) list.sort(byName);
  return diff;
};

/** Where the selected task is: its hash at the shown version, and at the other one (null where it doesn't exist). */
export const resolveTask = (
  name: string | null,
  version: EvalDatasetTask[],
  base: EvalDatasetTask[] | null
): { hash: string | null; baseHash: string | null } => {
  if (!name) return { hash: null, baseHash: null };
  return {
    hash: version.find((task) => task.name === name)?.hash ?? null,
    baseHash: base?.find((task) => task.name === name)?.hash ?? null,
  };
};
