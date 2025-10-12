import { Metadata } from "next";

import Events from "@/components/events/events";
import { EventsStoreProvider } from "@/components/events/events-store";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  return (
    <EventsStoreProvider projectId={projectId}>
      <Events />
    </EventsStoreProvider>
  );
}
