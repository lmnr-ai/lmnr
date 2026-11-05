import { type Metadata } from "next";
import { redirect } from "next/navigation";

import Signal from "@/components/signal";
import { resolveClusterForEvent } from "@/lib/actions/clusters/resolve-for-event";
import { getBrokerLicenseKey } from "@/lib/license";

export const metadata: Metadata = {
  title: "Events",
};

export default async function SignalPage(props: {
  params: Promise<{ projectId: string; signalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId, signalId }, searchParams] = await Promise.all([props.params, props.searchParams]);

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

  const brokerLicenseKey = process.env.SLACK_BROKER_URL ? await getBrokerLicenseKey() : null;

  return (
    <Signal
      slackClientId={process.env.SLACK_CLIENT_ID}
      slackRedirectUri={process.env.SLACK_REDIRECT_URL}
      slackBrokerEnabled={!!brokerLicenseKey}
    />
  );
}
