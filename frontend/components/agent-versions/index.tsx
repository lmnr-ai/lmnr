"use client";

import { useParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";

import Header from "@/components/ui/header";
import { ScrollArea } from "@/components/ui/scroll-area";

import AgentVersionsList from "./agent-versions-list";
import AgentsList from "./agents-list";

export default function AgentVersions() {
  const { projectId } = useParams<{ projectId: string }>();
  const [agentId, setAgentId] = useQueryState("agentId", parseAsString.withOptions({ history: "push" }));

  return (
    <div className="flex flex-col h-full gap-2">
      <Header path="agent versions" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-8 max-w-3xl 3xl:max-w-4xl mx-auto px-4 pb-24">
          {agentId ? (
            <AgentVersionsList projectId={projectId} agentId={agentId} onBack={() => setAgentId(null)} />
          ) : (
            <AgentsList projectId={projectId} onSelect={(id) => setAgentId(id)} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
