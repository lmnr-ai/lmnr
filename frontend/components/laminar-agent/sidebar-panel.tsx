"use client";

import AgentChatPanel from "./agent-chat-panel";
import AgentModeHeader from "./agent-mode-header";

export default function SidebarPanel() {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      <AgentChatPanel header={<AgentModeHeader currentMode="sidebar" />} maxWidth="max-w-full" />
    </div>
  );
}
