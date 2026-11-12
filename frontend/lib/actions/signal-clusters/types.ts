// Client-safe: components import these without pulling in server-only queries.

/** Days covered by each cluster's `daily` series, oldest first. */
export const CLUSTER_WINDOW_DAYS = 30;

export interface ClusterResolution {
  resolvedAt: string;
  /** Name of the user who resolved it; null when they were removed. */
  resolvedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  /** Resolved by the auto-resolve job after `AUTO_RESOLVE_DAYS` without events, not by a user. */
  automatic: boolean;
}

/** A signal's L1 cluster with its state for the current user. */
export interface SignalCluster {
  id: string;
  name: string;
  /** Events per UTC day, aligned with `SignalClustersResponse.days`. */
  daily: number[];
  /** All-time event count. */
  total: number;
  /** All-time distinct traces with an event in this cluster. */
  traces: number;
  /** Mean severity of its events, rounded: 0 Info, 1 Warning, 2 Critical. */
  severity: number;
  firstSeen: string;
  lastSeen: string;
  /** When clustering created the cluster. */
  createdAt: string;
  /** Most recent traces first. */
  sampleTraceIds: string[];
  status: "open" | "resolved";
  /** Oldest first. */
  resolutions: ClusterResolution[];
  /** Archived clusters leave Active and Resolved and never get new reports. */
  archived: ClusterArchive | null;
  unread: boolean;
}

export interface ClusterArchive {
  archivedAt: string;
  /** Null when that user was removed. */
  archivedBy: string | null;
}

/** The signal's events that belong to no cluster, listed after the clusters. */
export interface UnclusteredEvents {
  /** Per day of `SignalClustersResponse.days`. */
  daily: number[];
  total: number;
  lastSeen: string;
}

export interface SignalClustersResponse {
  /** `YYYY-MM-DD` UTC dates, oldest first, ending today. */
  days: string[];
  items: SignalCluster[];
  /** Null when every event is clustered. */
  unclustered: UnclusteredEvents | null;
}

export interface ClusterVersionMarker {
  label: string;
  /** When the version first appears among this cluster's traces. */
  firstSeen: string;
}

/** A pending report not updated for this long is treated as failed (its run died with the server). */
export const REPORT_STALE_MINUTES = 30;

/** The Laminar Agent's report on a cluster. */
export interface ClusterReport {
  id: string;
  status: "pending" | "done" | "failed";
  /** Markdown, when done. */
  content: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Events in 24h bars; `start` is the first bar's start, so a timestamp's bar is `floor((t - start) / 24h)`.
 * `toNow` when the range ends at "now" (`pastHours`): later timestamps belong on the last bar.
 */
export type ClusterDaily = { days: string[]; daily: number[]; start: string; toNow: boolean };
