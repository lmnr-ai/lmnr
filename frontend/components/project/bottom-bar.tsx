"use client";

import { usePathname } from "next/navigation";

import { useLaminarAgentStore } from "@/components/agent";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/posthog";

export default function ProjectBottomBar() {
  const pathname = usePathname();
  const agentOpen = useLaminarAgentStore((state) => state.viewMode === "open");
  const openAgent = useLaminarAgentStore((state) => state.open);
  const collapseAgent = useLaminarAgentStore((state) => state.collapse);

  if (pathname?.endsWith("/home")) {
    return null;
  }

  return (
    <div className="flex h-8 shrink-0 items-center justify-end border-t bg-background px-1">
      <Button
        type="button"
        variant={agentOpen ? "secondaryLight" : "ghost"}
        size="sm"
        icon="sparkles"
        aria-expanded={agentOpen}
        onClick={() => {
          if (agentOpen) {
            collapseAgent();
            return;
          }

          track("sessions", "agent_panel_opened", { surface: "agent_bottom_bar" });
          openAgent();
        }}
      >
        Agent
      </Button>
    </div>
  );
}
