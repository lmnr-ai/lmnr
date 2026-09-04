"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";

import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { TOOLTIP_DELAY_MS } from "./constants";
import SeverityIcon from "./severity-icon";
import { worstSeverity } from "./utils";

export default function SignalTab({ signal, active }: { signal: TraceSignal; active: boolean }) {
  const trigger = (
    <TabsTrigger
      value={signal.signalId}
      className={cn(
        "h-5.5 w-full min-w-0 rounded-md px-2 text-[11px] shadow-none",
        // Both variants on ours, or `TabsTrigger`'s own `data-[state=active]:bg-background`
        // / `dark:text-muted-foreground` outrank a plain utility and twMerge keeps them.
        active
          ? "data-[state=active]:bg-signal-tab-active dark:data-[state=active]:bg-signal-tab-active text-foreground dark:text-foreground"
          : "text-signal-tab hover:text-foreground dark:text-signal-tab dark:hover:text-foreground"
      )}
    >
      {/* The tab row replaces the header, so without this the severity glyph
          disappears exactly when there are several severities to tell apart. */}
      <span className="flex min-w-0 items-center justify-center gap-1.5">
        {signal.events.length > 0 && <SeverityIcon bare severity={worstSeverity(signal)} />}
        <span className="min-w-0 truncate">{signal.signalName}</span>
      </span>
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
