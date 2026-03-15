"use client";

import { type DataPart, Renderer, useJsonRenderMessage } from "@json-render/react";

import { agentCardRegistry } from "./registry";

interface AgentCardRendererProps {
  parts: DataPart[];
}

export default function AgentCardRenderer({ parts }: AgentCardRendererProps) {
  const { spec, hasSpec } = useJsonRenderMessage(parts);

  if (!hasSpec || !spec) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Renderer spec={spec} registry={agentCardRegistry} />
    </div>
  );
}
