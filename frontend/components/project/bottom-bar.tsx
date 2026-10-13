"use client";

import { usePathname } from "next/navigation";

import { useLaminarAgentStore } from "@/components/agent";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export default function ProjectBottomBar({ className }: Props) {
  const pathname = usePathname();
  const isAgentOpen = useLaminarAgentStore((state) => state.viewMode === "open");
  const openAgent = useLaminarAgentStore((state) => state.open);
  const collapseAgent = useLaminarAgentStore((state) => state.collapse);

  if (pathname?.endsWith("/home")) {
    return null;
  }

  return (
    <div className={cn("flex h-7 shrink-0 items-center justify-end px-3", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon="sparkles"
        aria-expanded={isAgentOpen}
        className={cn("hover:bg-surface-up-4 active:bg-surface-up-6", { "bg-surface-up-6": isAgentOpen })}
        onClick={() => {
          if (isAgentOpen) {
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
