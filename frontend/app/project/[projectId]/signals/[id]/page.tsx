import { type Metadata } from "next";
import { redirect } from "next/navigation";

import Signal from "@/components/signal";
import { resolveClusterForEvent } from "@/lib/actions/clusters/resolve-for-event";

export const metadata: Metadata = {
  title: "Events",
};

export default async function SignalPage(props: {
  params: Promise<{ projectId: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId, id: signalId }, searchParams] = await Promise.all([props.params, props.searchParams]);

  const eventClusterParam = searchParams.eventCluster;
  const eventCluster = Array.isArray(eventClusterParam) ? eventClusterParam[0] : eventClusterParam;

  if (eventCluster) {
    const resolved = await resolveClusterForEvent({ projectId, signalId, eventId: eventCluster }).catch(
      () => ({ kind: "none" }) as const
    );

    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "eventCluster") continue;
      if (Array.isArray(value)) {
        value.forEach((v) => nextParams.append(key, v));
      } else if (value != null) {
        nextParams.set(key, value);
      }
    }

    if (resolved.kind === "cluster") {
      nextParams.set("clusterId", resolved.clusterId);
    } else if (resolved.kind === "emergingCluster") {
      nextParams.set("emergingClusterId", resolved.emergingClusterId);
    }

    const query = nextParams.toString();
    redirect(`/project/${projectId}/signals/${signalId}${query ? `?${query}` : ""}`);
  }

  const traceIdParam = searchParams.traceId;
  const traceId = Array.isArray(traceIdParam) ? traceIdParam[0] : traceIdParam;

  return <Signal traceId={traceId} />;
}
