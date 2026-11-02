import { type Metadata } from "next";
import { redirect } from "next/navigation";

import AgentVersions from "@/components/agent-versions";
import { getAgents } from "@/lib/actions/agents";

export const metadata: Metadata = {
  title: "Agent versions",
};

export default async function AgentVersionsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  const [firstAgent] = await getAgents({ projectId });
  if (firstAgent) redirect(`/project/${projectId}/agent-versions/${firstAgent.id}`);

  return <AgentVersions />;
}
