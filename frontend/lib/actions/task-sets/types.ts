// Client-safe types for the Task sets page (no server imports).

/** `number` is null for run snapshots: versions a run used that were never pushed. */
export interface TaskSetVersionInfo {
  id: string;
  number: number | null;
  hash: string;
  parentId: string | null;
  createdAt: string;
}

export interface AgentVersionInfo {
  id: string;
  number: number | null;
  hash: string;
  gitSha: string | null;
  createdAt: string;
}

export interface TaskSetSummary {
  id: string;
  name: string;
  head: { id: string; number: number | null; createdAt: string } | null;
  taskCount: number;
  createdAt: string;
}

/** An agent with its task sets, as the Task sets list groups them. */
export interface AgentGroup {
  id: string;
  name: string;
  head: AgentVersionInfo | null;
  taskSets: TaskSetSummary[];
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
  agent: { id: string; name: string; headVersionId: string | null };
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
  versionNumber: number | null;
}

/** What an evaluation's header links to. */
export interface TaskSetLink {
  taskSetId: string;
  taskSetName: string;
  agentName: string;
  versionNumber: number | null;
}
