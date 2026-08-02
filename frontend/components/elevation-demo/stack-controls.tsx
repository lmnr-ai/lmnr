"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { ElevationBadge } from "./elevation-badge";

const chip = "rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-surface-up";

/**
 * The per-level control strip in the surfaces stack: a live badge, a button exercising the
 * hover/active bump utilities, and a popover + tooltip that each open two levels above THIS
 * level (their badges prove it) — so every nesting depth is a self-contained test.
 */
export function StackControls() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ElevationBadge />
      <button className="rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-surface-up active:bg-surface-up-2">
        hover:up · active:up-up
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button className={chip}>Popover</button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-2">
          <p className="text-xs text-muted-foreground">Opened from this level.</p>
          <ElevationBadge />
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={chip}>Tooltip</button>
        </TooltipTrigger>
        <TooltipContent className="space-y-1.5 p-2">
          <p className="text-xs">Opened from this level.</p>
          <ElevationBadge />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
