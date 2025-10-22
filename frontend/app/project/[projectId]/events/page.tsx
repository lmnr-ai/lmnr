import { Metadata } from "next";

import EventDefinitions from "@/components/event-definitions/event-definitions";
import { EventDefinitionsStoreProvider } from "@/components/event-definitions/event-definitions-store";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  return (
    <EventDefinitionsStoreProvider projectId={projectId}>
      <EventDefinitions />
    </EventDefinitionsStoreProvider>
  );
}
