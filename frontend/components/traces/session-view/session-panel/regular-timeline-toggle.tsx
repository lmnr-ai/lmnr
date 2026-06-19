"use client";

import { GanttChart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useSessionViewStore } from "../store";

/**
 * Regular-session-only timeline toggle button. Reads the concrete store
 * (sessionTimelineEnabled) so it MUST NOT mount under the debugger provider —
 * passed to SessionPanel as `timelineToggle` only from regular SessionViewContent.
 */
export default function RegularTimelineToggle() {
  const sessionTimelineEnabled = useSessionViewStore((s) => s.sessionTimelineEnabled);
  const setSessionTimelineEnabled = useSessionViewStore((s) => s.setSessionTimelineEnabled);

  return (
    <Button
      onClick={() => setSessionTimelineEnabled(!sessionTimelineEnabled)}
      variant="outline"
      className={cn(
        "h-6 text-xs px-1.5",
        sessionTimelineEnabled ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary"
      )}
    >
      <GanttChart size={14} className="mr-1" />
      Timeline
    </Button>
  );
}
