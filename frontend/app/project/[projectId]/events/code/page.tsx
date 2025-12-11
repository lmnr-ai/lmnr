import { Metadata } from "next";

import CodeEventDefinitions from "@/components/event-definitions/code-event-definitions";

export const metadata: Metadata = {
  title: "Code Event Definitions",
};

export default async function CodeEventsPage() {
  return <CodeEventDefinitions />;
}
