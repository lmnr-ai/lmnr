"use client";

import { useLaminarAgentStore } from "@/components/agent";
import AgentIcon from "@/components/agent/agent-icon";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

import BottomBarLinks from "./links";

interface Props {
  /** The agent feature flag; the bar itself always renders. */
  showAgent: boolean;
  className?: string;
}

export default function ProjectBottomBar({ showAgent, className }: Props) {
  const isAgentOpen = useLaminarAgentStore((state) => state.viewMode === "open");
  const openAgent = useLaminarAgentStore((state) => state.open);
  const collapseAgent = useLaminarAgentStore((state) => state.collapse);
  // With the sidebar collapsed (or off-canvas on mobile) nothing sits left of the bar, so the logo needs its own inset.
  const { state, isMobile } = useSidebar();

  return (
    <div
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 pr-3",
        { "pl-2": isMobile || state === "collapsed" },
        className
      )}
    >
      <BottomBarLinks />
      <div className="flex-1" />
      {showAgent && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={isAgentOpen}
          className={cn("gap-2 hover:bg-emphasis-1 active:bg-emphasis-2", { "bg-emphasis-2": isAgentOpen })}
          onClick={() => {
            if (isAgentOpen) {
              collapseAgent();
              return;
            }

            track("sessions", "agent_panel_opened", { surface: "agent_bottom_bar" });
            openAgent();
          }}
        >
          <AgentIcon />
          Agent
        </Button>
      )}
    </div>
  );
}
