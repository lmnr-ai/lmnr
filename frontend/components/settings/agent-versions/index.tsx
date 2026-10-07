"use client";

import { useParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";

import AgentVersionsList from "./agent-versions-list";
import AgentsList from "./agents-list";

export default function AgentVersions() {
  const { projectId } = useParams<{ projectId: string }>();
  const [agentId, setAgentId] = useQueryState("agentId", parseAsString.withOptions({ history: "push" }));

  if (agentId) {
    return <AgentVersionsList projectId={projectId} agentId={agentId} onBack={() => setAgentId(null)} />;
  }

  return <AgentsList projectId={projectId} onSelect={(id) => setAgentId(id)} />;
}
