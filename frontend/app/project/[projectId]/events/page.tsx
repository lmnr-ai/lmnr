import { Metadata } from "next";

import EventDefinitions from "@/components/event-definitions/event-definitions";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage(props: { params: Promise<{ projectId: string }> }) {
  return <EventDefinitions />;
}
