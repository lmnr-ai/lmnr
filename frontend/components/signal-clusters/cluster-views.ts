import { type SignalCluster } from "@/lib/actions/signal-clusters/types";

/** Hidden when the signal doesn't allow resolving, along with the rest of that feature. */
export const RESOLVED_VIEW = "resolved";

export const CLUSTER_VIEWS = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "archived", label: "Archived" },
] as const;

export type ClusterView = (typeof CLUSTER_VIEWS)[number]["value"];

const inView = (cluster: SignalCluster, view: ClusterView) => {
  if (view === "archived") return !!cluster.archived;
  if (cluster.archived) return false;
  return view === "resolved" ? cluster.status === "resolved" : cluster.status === "open";
};

// Resolutions are oldest first, so the last one is the current resolve.
const sortKey = (cluster: SignalCluster, view: ClusterView) =>
  view === "resolved" ? (cluster.resolutions.at(-1)?.resolvedAt ?? cluster.lastSeen) : cluster.lastSeen;

/** Archived clusters only show under Archived. Resolved lists the latest resolved first; the others the most recently seen. */
export const viewClusters = (clusters: SignalCluster[], view: ClusterView): SignalCluster[] =>
  clusters.filter((i) => inView(i, view)).sort((a, b) => sortKey(b, view).localeCompare(sortKey(a, view)));
