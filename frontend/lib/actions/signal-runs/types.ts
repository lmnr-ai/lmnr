// Split from `index.ts` so client components can import these values without pulling drizzle into the bundle.

// Run stages in pipeline order; mirrors `RunStatus` in the app-server and the `signal_runs_v0` view's `multiIf`.
export const SIGNAL_RUN_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "UNKNOWN"] as const;

export type SignalRunStatus = (typeof SIGNAL_RUN_STATUSES)[number];

// Raw `signal_runs.status` discriminants; only needed when querying the table without `executeQuery`'s view rewrite.
export const SIGNAL_RUN_STATUS_CODES = {
  PROCESSING: 0,
  COMPLETED: 1,
  FAILED: 2,
  PENDING: 3,
} as const satisfies Partial<Record<SignalRunStatus, number>>;

// Stages where the agent never ran, so there is nothing to report on. Names, not codes — queries hit the v0 view.
export const NON_ANALYZED_SIGNAL_RUN_STATUSES: SignalRunStatus[] = ["PENDING"];

// Per-bucket Runs chart counts. `count` is analyzed-only (the cluster-chart denominator); the rest stack to all runs.
export type SignalRunStatsDataPoint = {
  timestamp: string;
  count: number;
  eventCreated: number;
  noEvent: number;
  failed: number;
  inProgress: number;
};

export type SignalRun = {
  projectId: string;
  signalId: string;
  jobId: string;
  triggerId: string;
  runId: string;
  traceId: string;
  status: SignalRunStatus;
  eventId: string;
  updatedAt: string;
  mode: "BATCH" | "REALTIME" | "UNKNOWN";
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
};

export type SignalRunRow = Pick<
  SignalRun,
  | "jobId"
  | "runId"
  | "traceId"
  | "triggerId"
  | "status"
  | "eventId"
  | "updatedAt"
  | "inputTokens"
  | "cacheReadTokens"
  | "outputTokens"
> & {
  // Priced server-side (`signalTokenCostMicroUsd`) so env rate overrides are honoured and match metered usage.
  costMicroUsd: number;
  // Clusters this run's event landed in; plural because an event can carry several independently-clustered summaries.
  clusters: SignalRunCluster[];
};

export type SignalRunCluster = {
  id: string;
  name: string;
  level: number;
  numChildrenClusters: number;
};
