import { type Metadata } from "next";

import AgentVersions from "@/components/agent-versions";

export const metadata: Metadata = {
  title: "Agent versions",
};

export default function AgentVersionsPage() {
  return <AgentVersions />;
}
