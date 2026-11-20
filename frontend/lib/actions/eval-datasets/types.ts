/** An eval dataset (`lmnr-cli eval dataset push`), as the datasets list shows it. */
export interface EvalDatasetSummary {
  id: string;
  createdAt: string;
  taskCount: number;
  /** When a version was last pushed; null for a dataset with no versions. */
  lastPushedAt: string | null;
}

/** One version of a task. Versions are independent: a dataset.toml pin, not Laminar, picks one. */
export interface EvalTaskVersion {
  hash: string;
  /** When this version was first pushed; re-pushing the same content keeps it. */
  pushedAt: string;
}

/** A task as the dataset page lists it; its versions load with the files dialog. */
export interface EvalTaskSummary {
  id: string;
  versionCount: number;
  /** When its newest version was pushed. */
  lastPushedAt: string;
  /** When its first version was pushed. */
  createdAt: string;
}

export interface EvalDataset {
  id: string;
  createdAt: string;
  taskCount: number;
}

/** The short form of a task version hash. */
export const shortHash = (hash: string): string => hash.slice(0, 12);
