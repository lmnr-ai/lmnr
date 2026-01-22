import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import React, { type PropsWithChildren } from "react";

import { SignalStoreProvider } from "@/components/signal/store.tsx";
import Header from "@/components/ui/header.tsx";
import { getClusterConfig } from "@/lib/actions/cluster-configs";
import { getLastEvent } from "@/lib/actions/events";
import { getSemanticEventDefinition, type SemanticEventDefinition } from "@/lib/actions/semantic-event-definitions";
import { EVENTS_TRACE_VIEW_WIDTH } from "@/lib/actions/traces";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";

const Layout = async (props: PropsWithChildren<{ params: Promise<{ projectId: string; id: string }> }>) => {
  const { projectId, id } = await props.params;

  const eventDefinition = (await getSemanticEventDefinition({ projectId, id })) as SemanticEventDefinition | undefined;

  if (!eventDefinition) {
    return notFound();
  }

  const [lastEvent, clusterConfig] = await Promise.all([
    getLastEvent({ projectId, name: eventDefinition.name, eventSource: "SEMANTIC" }),
    getClusterConfig({ projectId, eventName: eventDefinition.name, eventSource: "SEMANTIC" }),
  ]);

  const cookieStore = await cookies();
  const traceViewWidthCookie = cookieStore.get(EVENTS_TRACE_VIEW_WIDTH);
  const initialTraceViewWidth = traceViewWidthCookie ? parseInt(traceViewWidthCookie.value, 10) : undefined;

  const isSignalsEnabled = isFeatureEnabled(Feature.SIGNALS);

  return (
    <>
      <SignalStoreProvider
        lastEvent={lastEvent}
        initialTraceViewWidth={initialTraceViewWidth}
        eventDefinition={eventDefinition}
        clusterConfig={clusterConfig}
        isSignalsEnabled={isSignalsEnabled}
      >
        <Header path="signals" />
        {props.children}
      </SignalStoreProvider>
    </>
  );
};
export default Layout;
