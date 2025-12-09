import { Metadata } from "next";

import SemanticEventDefinitions from "@/components/event-definitions/semantic-event-definitions";

export const metadata: Metadata = {
  title: "Semantic Event Definitions",
};

export default async function SemanticEventsPage() {
  return <SemanticEventDefinitions />;
}
