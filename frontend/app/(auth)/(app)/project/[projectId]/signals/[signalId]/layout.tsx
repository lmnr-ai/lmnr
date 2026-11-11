import { notFound } from "next/navigation";
import React, { type PropsWithChildren } from "react";

import Signal from "@/components/signal";
import { type EventsProps, SignalStoreProvider } from "@/components/signal/store.tsx";
import { getSignal } from "@/lib/actions/signals";
import { getBrokerLicenseKey } from "@/lib/license";

// The page renders here rather than in `page.tsx`, so moving between `/clusters/[clusterId]` routes keeps the list's
// scroll and panel sizes. The pages only redirect.
const Layout = async (props: PropsWithChildren<{ params: Promise<{ projectId: string; signalId: string }> }>) => {
  const { projectId, signalId } = await props.params;

  const signal = (await getSignal({ projectId, id: signalId })) as EventsProps["signal"] | undefined;

  if (!signal) {
    return notFound();
  }

  const brokerLicenseKey = process.env.SLACK_BROKER_URL ? await getBrokerLicenseKey() : null;

  return (
    <SignalStoreProvider signal={signal}>
      <Signal
        slackClientId={process.env.SLACK_CLIENT_ID}
        slackRedirectUri={process.env.SLACK_REDIRECT_URL}
        slackBrokerEnabled={!!brokerLicenseKey}
      />
      {props.children}
    </SignalStoreProvider>
  );
};
export default Layout;
