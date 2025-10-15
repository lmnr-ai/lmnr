import { Metadata } from "next";
import { notFound } from "next/navigation";

import Events from "@/components/events/events";
import { EventsStoreProvider } from "@/components/events/events-store";
import { EventDefinition, getEventDefinition } from "@/lib/actions/event-definitions";
import { getLastEvent } from "@/lib/actions/events";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await props.params;

  const eventDefinition = (await getEventDefinition({ projectId, id })) as EventDefinition | undefined;
  if (!eventDefinition) {
    return notFound();
  }

  const lastEvent = await getLastEvent({ projectId, name: eventDefinition.name });

  return (
    <EventsStoreProvider eventDefinition={eventDefinition}>
      <Events lastEvent={lastEvent} />
    </EventsStoreProvider>
  );
}
