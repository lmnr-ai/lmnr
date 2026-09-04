"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";

import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { TOOLTIP_DELAY_MS } from "./constants";
import SeverityIcon from "./severity-icon";
import { worstSeverity } from "./utils";

export default function SignalTab({ signal }: { signal: TraceSignal }) {
  const trigger = (
    <TabsTrigger value={signal.signalId} className="w-full min-w-0">
      {/* The tab row replaces the header, so without this the severity glyph
          disappears exactly when there are several severities to tell apart. */}
      {signal.events.length > 0 && <SeverityIcon bare severity={worstSeverity(signal)} />}
      <span className="min-w-0 truncate">{signal.signalName}</span>
    </TabsTrigger>
  );

  // The trigger is a WRAPPER, not the tab: both primitives own a `data-state` and
  // `Tabs.Trigger` spreads props after its own, so `asChild` would clobber it.
  return (
    <Tooltip delayDuration={TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 flex-1">{trigger}</span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom">{signal.signalName}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
