import { type Metadata } from "next";

import SemanticEventBackfill from "@/components/event-definitions/semantic-event-backfill";

export const metadata: Metadata = {
  title: "Retroactive Semantic Event Analysis",
};

export default function BackfillPage() {
  return <SemanticEventBackfill />;
}
