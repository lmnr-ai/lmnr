/** Client-safe surface of `lib/actions/eval-datasets` (no server imports). */

export interface EvalDatasetListItem {
  id: string;
  name: string;
  createdAt: string;
  /** Null until the first push. */
  latestVersion: number | null;
  /** Tasks in the latest version; null without one. */
  taskCount: number | null;
  /** When the latest version was pushed (the dataset's creation without one). */
  updatedAt: string;
}

export interface EvalDatasetVersionItem {
  id: string;
  version: number;
  parentVersion: number | null;
  message: string | null;
  createdAt: string;
  /** Null when the pushing user was deleted (or the push used a project API key). */
  authorName: string | null;
  authorEmail: string | null;
  taskCount: number;
  /** Evaluations in the version's group (`evaluationGroupOf`). */
  runCount: number;
}

export interface EvalDatasetTask {
  name: string;
  /** `sha256:<64 hex>`, the content hash of the task's files. */
  hash: string;
}

export interface EvalDatasetVersionDetails extends Omit<EvalDatasetVersionItem, "taskCount"> {
  dataset: string;
  tasks: EvalDatasetTask[];
  /** All the dataset's version numbers, newest first. */
  versions: number[];
}

/** The evaluation group `lmnr-cli eval run` reports a run of this version to. */
export const evaluationGroupOf = (dataset: string, version: number) => `${dataset} v${version}`;

/** The 64 hex of a `sha256:<hex>` task hash, as it appears in storage keys and URLs. */
export const taskHashHex = (hash: string) => hash.replace(/^sha256:/, "");
