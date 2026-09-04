"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";

import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { TOOLTIP_DELAY_MS } from "./constants";
import SeverityIcon from "./severity-icon";
import { worstSeverity } from "./utils";

/** The active tab's wash, laid OVER its surface step as a flat gradient —
 *  `background-color` would replace the step instead of sitting on it. */
const ACTIVE_WASH = "color-mix(in oklab, var(--color-signal) 8%, transparent)";

export default function SignalTab({ signal, active }: { signal: TraceSignal; active: boolean }) {
  const trigger = (
    <TabsTrigger
      value={signal.signalId}
      className={cn(
        "h-5.5 w-full min-w-0 rounded-md px-2 text-[11px] shadow-none",
        // A step off the panel's elevation, not `bg-gray-900`: a fixed near-black
        // that ignores the surface ladder and reads as a hole in the header.
        // Both variants, or `TabsTrigger`'s own `data-[state=active]:bg-background`
        // and `dark:...:bg-input/30` outrank a plain `bg-*` and twMerge keeps them.
        active
          ? "data-[state=active]:bg-surface-up-2 dark:data-[state=active]:bg-surface-up-2 text-foreground dark:text-foreground"
          : // `dark:` on ours too — `TabsTrigger` ships `dark:text-muted-foreground`,
            // and a bare `text-*` never outranks a variant.
            "text-signal-tab hover:text-foreground dark:text-signal-tab dark:hover:text-foreground"
      )}
      style={active ? { backgroundImage: `linear-gradient(${ACTIVE_WASH}, ${ACTIVE_WASH})` } : undefined}
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
