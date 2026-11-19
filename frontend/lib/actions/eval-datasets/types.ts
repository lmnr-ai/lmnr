/** An eval dataset (`lmnr-cli eval dataset push`), as the datasets list shows it. */
export interface EvalDatasetSummary {
  id: string;
  taskCount: number;
  /** When a version was last pushed; null for a dataset with no versions. */
  lastPushedAt: string | null;
}

export interface EvalTaskVersion {
  hash: string;
  /** When this version was last pushed (a re-push moves it). */
  pushedAt: string;
}

export interface EvalDatasetTask {
  id: string;
  /** Newest first: the first is the task's latest version. */
  versions: EvalTaskVersion[];
}

export interface EvalDataset {
  id: string;
  createdAt: string;
  tasks: EvalDatasetTask[];
}

/** The short form of a task version hash. */
export const shortHash = (hash: string): string => hash.slice(0, 12);

/**
 * Groups `task_versions` rows by task. Rows come sorted by task, then newest
 * first (`created_at` desc, `hash` desc: how the latest version is defined, at
 * Postgres' microsecond precision), and both orders are kept.
 */
export const groupTaskVersions = (rows: { taskId: string; hash: string; pushedAt: string }[]): EvalDatasetTask[] => {
  const tasks = new Map<string, EvalTaskVersion[]>();
  for (const { taskId, hash, pushedAt } of rows) {
    const versions = tasks.get(taskId) ?? [];
    versions.push({ hash, pushedAt });
    tasks.set(taskId, versions);
  }
  return [...tasks].map(([id, versions]) => ({ id, versions }));
};
