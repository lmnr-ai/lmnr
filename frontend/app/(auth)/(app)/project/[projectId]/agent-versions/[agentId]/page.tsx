import { type Metadata } from "next";
import { notFound } from "next/navigation";

import AgentVersions from "@/components/agent-versions";
import { getAgentVersions, GetAgentVersionsSchema } from "@/lib/actions/agents";

export const metadata: Metadata = {
  title: "Agent versions",
};

export default async function AgentVersionPage(props: { params: Promise<{ projectId: string; agentId: string }> }) {
  const params = await props.params;
  const parsed = GetAgentVersionsSchema.safeParse(params);
  if (!parsed.success) notFound();

  const initialVersions = await getAgentVersions(parsed.data);
  if (!initialVersions) notFound();

  return <AgentVersions agentId={params.agentId} initialVersions={initialVersions} />;
}
