import { type Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import Events from "@/components/events";
import { EventsStoreProvider } from "@/components/events/events-store";
import { getClusterConfig } from "@/lib/actions/cluster-configs";
import { getLastEvent } from "@/lib/actions/events";
import { getSemanticEventDefinition, type SemanticEventDefinition } from "@/lib/actions/semantic-event-definitions";
import { EVENTS_TRACE_VIEW_WIDTH } from "@/lib/actions/traces";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Events",
};

export default async function SemanticEventPage(props: {
  params: Promise<{ projectId: string; id: string }>;
  searchParams: Promise<{ traceId?: string; spanId?: string }>;
}) {
  const { projectId, id } = await props.params;
  const { traceId, spanId } = await props.searchParams;

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
  const isSemanticEventsEnabled = isFeatureEnabled(Feature.SEMANTIC_EVENTS);

  return (
    <EventsStoreProvider
      eventDefinition={eventDefinition}
      traceId={traceId}
      spanId={spanId}
      clusterConfig={clusterConfig}
      isSemanticEventsEnabled={isSemanticEventsEnabled}
    >
      <Events eventType="SEMANTIC" lastEvent={lastEvent} initialTraceViewWidth={initialTraceViewWidth} />
    </EventsStoreProvider>
  );
}
