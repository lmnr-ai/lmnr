"use client";

import AgentPanel from "./agent-panel";
import { useLaminarAgentStore } from "./store";

export default function FloatingPanel() {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);

  if (viewMode !== "floating") {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[400px] h-[70vh] rounded-lg border shadow-xl overflow-hidden">
      <AgentPanel currentMode="floating" />
    </div>
  );
}
