/** An eval dataset (`lmnr-cli eval dataset push`), as the datasets list shows it. */
export interface EvalDatasetSummary {
  id: string;
  createdAt: string;
  taskCount: number;
  /** When a version was last pushed; null for a dataset with no versions. */
  lastPushedAt: string | null;
}

export interface EvalTaskVersion {
  hash: string;
  /** When this version was last pushed (a re-push moves it). */
  pushedAt: string;
}

/** A task as the dataset page lists it: its latest version; older ones load with the files dialog. */
export interface EvalTaskSummary {
  id: string;
  latest: EvalTaskVersion;
  versionCount: number;
  /** The oldest version's push time; re-pushing that exact hash moves it. */
  createdAt: string;
}

export interface EvalDataset {
  id: string;
  createdAt: string;
  taskCount: number;
}

/** The short form of a task version hash. */
export const shortHash = (hash: string): string => hash.slice(0, 12);
