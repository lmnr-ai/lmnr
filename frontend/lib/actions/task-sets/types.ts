// Client-safe types for the Task sets page (no server imports).

export interface TaskSetVersionInfo {
  id: string;
  number: number;
  hash: string;
  parentId: string | null;
  createdAt: string;
}

export interface TaskSetSummary {
  id: string;
  name: string;
  head: { id: string; number: number; createdAt: string } | null;
  taskCount: number;
  createdAt: string;
  /** When the newest evaluation linked to any of its versions started. */
  lastRunAt: string | null;
}

/** A version with what changed against its parent, compared by task name and digest. */
export interface TaskSetVersionWithDiff extends TaskSetVersionInfo {
  taskCount: number;
  added: number;
  removed: number;
  changed: number;
}

export interface TaskSetDetail {
  id: string;
  name: string;
  headVersionId: string | null;
  /** Newest first. */
  versions: TaskSetVersionWithDiff[];
}

export interface TaskInfo {
  id: string;
  name: string;
  digest: string;
  metadata: Record<string, unknown> | null;
}

export interface TaskSetRun {
  id: string;
  name: string;
  groupId: string;
  createdAt: string;
  versionId: string;
  versionNumber: number;
}

/** What an evaluation's header links to. */
export interface TaskSetLink {
  taskSetId: string;
  taskSetName: string;
  versionNumber: number;
}
