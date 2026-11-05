"use client";

import { GanttChart } from "lucide-react";

import { PILL, PILL_ACTIVE } from "@/components/shared/traces/pill";
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
      variant="ghost"
      className={cn(PILL, sessionTimelineEnabled && PILL_ACTIVE)}
      onClick={() => setSessionTimelineEnabled(!sessionTimelineEnabled)}
    >
      <GanttChart data-icon="inline-start" size={14} className="flex-shrink-0" />
      <span className="ml-1">Timeline</span>
    </Button>
  );
}
