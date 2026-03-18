"use client";

import AgentPanel from "./agent-panel";
import { useLaminarAgentStore } from "./store";

export default function FloatingPanel() {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);

  if (viewMode !== "floating") {
    return null;
  }

  return (
    <div className="fixed right-6 bottom-6 z-[60] w-[400px] max-w-[calc(100vw-3rem)] h-[70vh] max-h-[calc(100vh-3rem)] rounded-lg border shadow-xl overflow-hidden bg-background">
      <AgentPanel currentMode="floating" />
    </div>
  );
}
