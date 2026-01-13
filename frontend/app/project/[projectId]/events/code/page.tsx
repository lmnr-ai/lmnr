import { type Metadata } from "next";

import CodeEventDefinitions from "@/components/event-definitions/code-event-definitions";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Code Event Definitions",
};

export default async function CodeEventsPage() {
  const isSemanticEventsEnabled = isFeatureEnabled(Feature.SEMANTIC_EVENTS);
  return <CodeEventDefinitions isSemanticEventsEnabled={isSemanticEventsEnabled} />;
}
