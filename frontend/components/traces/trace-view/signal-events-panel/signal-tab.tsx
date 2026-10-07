"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";

import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { TOOLTIP_DELAY_MS } from "./constants";
import SeverityIcon from "./severity-icon";
import { worstSeverity } from "./utils";

/**
 * The active tab as a step off the card, not `bg-gray-900` — a fixed near-black
 * that ignores the surface ladder and reads as a hole punched in the header.
 *
 * Both variants on ours, and `data-[state=active]:` on the overrides, because
 * `TabsTrigger`'s own rules are variant-qualified: `dark:data-[state=active]:bg-input/30`
 * and `dark:text-muted-foreground` outrank any plain utility, and
 * `data-[state=active]:shadow-sm` outranks a plain `shadow-none`. Match the
 * variant or the rule never lands.
 */
const TAB = cn(
  "h-5.5 w-full min-w-0 rounded-md px-2 text-[11px]",
  "data-[state=active]:bg-surface-up-5 dark:data-[state=active]:bg-surface-up-5",
  "data-[state=active]:text-foreground dark:data-[state=active]:text-foreground",
  "data-[state=active]:shadow-none",
  "text-secondary-foreground dark:text-secondary-foreground",
  "hover:bg-surface-up-2 hover:text-foreground dark:hover:text-foreground",
  // The active tab is already the painted one; lighting it further on hover
  // would promise the click does something.
  "data-[state=active]:hover:bg-surface-up-5"
);

export default function SignalTab({ signal }: { signal: TraceSignal }) {
  const trigger = (
    <TabsTrigger value={signal.signalId} className={TAB}>
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
