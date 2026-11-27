import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveClusterForEvent } from "@/lib/actions/clusters/resolve-for-event";

export const metadata: Metadata = {
  title: "Events",
};

export default async function SignalPage(props: {
  params: Promise<{ projectId: string; signalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId, signalId }, searchParams] = await Promise.all([props.params, props.searchParams]);

  const first = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  /** The current query minus `drop` (and `alsoDrop`), plus `add`, as a `?…` suffix. */
  const query = (drop: string, add: Record<string, string> = {}, alsoDrop?: string) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === drop || key === alsoDrop) continue;
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value != null) next.set(key, value);
    }
    for (const [key, value] of Object.entries(add)) next.set(key, value);
    const str = next.toString();
    return str ? `?${str}` : "";
  };
  const base = `/project/${projectId}/signals/${signalId}`;

  const eventCluster = first("eventCluster");
  if (eventCluster) {
    const resolved = await resolveClusterForEvent({ projectId, signalId, eventId: eventCluster }).catch(
      () => ({ kind: "none" }) as const
    );
    if (resolved.kind === "cluster") redirect(`${base}/clusters/${resolved.clusterId}${query("eventCluster")}`);
    if (resolved.kind === "emergingCluster") {
      redirect(`${base}${query("eventCluster", { emergingClusterId: resolved.emergingClusterId })}`);
    }
    redirect(`${base}${query("eventCluster")}`);
  }

  // Older links (notifications, agent answers) carry the cluster as `?clusterId=`, some with the old `tab=events`.
  const clusterId = first("clusterId");
  const tab = first("tab");
  if (clusterId && (!tab || tab === "events")) {
    redirect(`${base}/clusters/${clusterId}${query("clusterId", {}, "tab")}`);
  }

  return null;
}
