import { Metadata } from "next";
import { notFound } from "next/navigation";

import { EventDefinition } from "@/components/event-definitions/event-definitions-store.tsx";
import Events from "@/components/events/events";
import { EventsStoreProvider } from "@/components/events/events-store";
import { getEventDefinition } from "@/lib/actions/event-definitions";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await props.params;

  const eventDefinition = (await getEventDefinition({ projectId, id })) as EventDefinition | undefined;

  if (!eventDefinition) {
    return notFound();
  }

  return (
    <EventsStoreProvider eventDefinition={eventDefinition}>
      <Events />
    </EventsStoreProvider>
  );
}
