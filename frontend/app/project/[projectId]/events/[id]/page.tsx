import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import Events from "@/components/events";
import { EventsStoreProvider } from "@/components/events/events-store";
import { EventDefinition, getEventDefinition } from "@/lib/actions/event-definitions";
import { getLastEvent } from "@/lib/actions/events";
import { EVENTS_TRACE_VIEW_WIDTH } from "@/lib/actions/traces";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage(props: {
  params: Promise<{ projectId: string; id: string }>;
  searchParams: Promise<{ traceId?: string; spanId?: string }>;
}) {
  const { projectId, id } = await props.params;
  const { traceId, spanId } = await props.searchParams;

  const eventDefinition = (await getEventDefinition({ projectId, id })) as EventDefinition | undefined;
  if (!eventDefinition) {
    return notFound();
  }

  const lastEvent = await getLastEvent({ projectId, name: eventDefinition.name });

  const cookieStore = await cookies();
  const traceViewWidthCookie = cookieStore.get(EVENTS_TRACE_VIEW_WIDTH);
  const initialTraceViewWidth = traceViewWidthCookie ? parseInt(traceViewWidthCookie.value, 10) : undefined;

  return (
    <EventsStoreProvider eventDefinition={eventDefinition} traceId={traceId} spanId={spanId}>
      <Events lastEvent={lastEvent} initialTraceViewWidth={initialTraceViewWidth} />
    </EventsStoreProvider>
  );
}
