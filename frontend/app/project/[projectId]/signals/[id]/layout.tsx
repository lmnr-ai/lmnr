import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import React, { type PropsWithChildren } from "react";

import { SignalStoreProvider } from "@/components/signal/store.tsx";
import { getClusterConfig } from "@/lib/actions/cluster-configs";
import { getLastEvent, getSignal, type Signal } from "@/lib/actions/signals";
import { EVENTS_TRACE_VIEW_WIDTH } from "@/lib/actions/traces";

const Layout = async (props: PropsWithChildren<{ params: Promise<{ projectId: string; id: string }> }>) => {
  const { projectId, id } = await props.params;

  const signal = (await getSignal({ projectId, id })) as Signal | undefined;

  if (!signal) {
    return notFound();
  }

  const [lastEvent, clusterConfig] = await Promise.all([
    getLastEvent({ projectId, name: signal.name }),
    getClusterConfig({ projectId, eventName: signal.name }),
  ]);

  const cookieStore = await cookies();
  const traceViewWidthCookie = cookieStore.get(EVENTS_TRACE_VIEW_WIDTH);
  const initialTraceViewWidth = traceViewWidthCookie ? parseInt(traceViewWidthCookie.value, 10) : undefined;

  return (
    <>
      <SignalStoreProvider
        lastEvent={lastEvent}
        initialTraceViewWidth={initialTraceViewWidth}
        signal={signal}
        clusterConfig={clusterConfig}
      >
        {props.children}
      </SignalStoreProvider>
    </>
  );
};
export default Layout;
