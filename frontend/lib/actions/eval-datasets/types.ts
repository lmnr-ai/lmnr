/** Client-safe surface of `lib/actions/eval-datasets` (no server imports). */

/** Dataset and task names (the app-server enforces the same rule); they go into storage keys and URLs. */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_DATASET_NAME_BYTES = 100;
const MAX_TASK_NAME_BYTES = 255;
/** A task version: sha256 of the task dir's content listing, computed by lmnr-cli. */
const TASK_HASH_RE = /^[0-9a-f]{64}$/;

// The name rule allows ASCII only, so length is byte length.
export const isDatasetName = (name: string): boolean => NAME_RE.test(name) && name.length <= MAX_DATASET_NAME_BYTES;
export const isTaskName = (name: string): boolean => NAME_RE.test(name) && name.length <= MAX_TASK_NAME_BYTES;
export const isTaskHash = (hash: string): boolean => TASK_HASH_RE.test(hash);

/** How a hash is shown in lists. */
export const shortHash = (hash: string): string => hash.slice(0, 12);

export interface EvalDatasetListItem {
  name: string;
  createdAt: string;
  taskCount: number;
  /** When a task version was last pushed (the dataset's creation without one). */
  updatedAt: string;
}

export interface EvalDatasetTaskItem {
  name: string;
  /** The latest version's hash. */
  hash: string;
  /** When the latest version was pushed. */
  updatedAt: string;
  versionCount: number;
}

export interface TaskVersion {
  hash: string;
  createdAt: string;
}
