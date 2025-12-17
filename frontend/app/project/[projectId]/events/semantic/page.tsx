import { Metadata } from "next";

import SemanticEventDefinitions from "@/components/event-definitions/semantic-event-definitions";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Semantic Event Definitions",
};

export default async function SemanticEventsPage() {
  const isSemanticEventsEnabled = isFeatureEnabled(Feature.SEMANTIC_EVENTS);
  return <SemanticEventDefinitions isSemanticEventsEnabled={isSemanticEventsEnabled} />;
}
