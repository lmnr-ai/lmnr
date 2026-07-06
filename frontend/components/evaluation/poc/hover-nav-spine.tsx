"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type HoverNavMode = "reveal" | "flyout" | "pin";

interface HoverNavSpineProps {
  mode: HoverNavMode;
  width: number;
  expanded: boolean;
  everExpanded: boolean;
  collapsed: ReactNode;
  expandedTable: ReactNode;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * The left box anchored at the content-area's left edge. In flyout mode it's
 * a static spine (always the collapsed card list; the full table lives in a
 * separate `HoverNavFlyout` surface). In reveal/pin it IS the growing surface:
 * width animates 280px -> 80%, and its two content layers crossfade.
 */
export default function HoverNavSpine({
  mode,
  width,
  expanded,
  everExpanded,
  collapsed,
  expandedTable,
  onMouseEnter,
  onMouseLeave,
}: HoverNavSpineProps) {
  return (
    <div
      className="absolute left-0 top-0 z-30 h-full overflow-hidden rounded-md border bg-background shadow-lg"
      style={
        mode === "flyout"
          ? { width }
          : { width: expanded ? "80%" : width, transition: "width 250ms cubic-bezier(.2,.8,.2,1)" }
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {mode === "flyout" ? (
        collapsed
      ) : (
        <div className="relative h-full">
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-150",
              expanded ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
          >
            {collapsed}
          </div>
          {everExpanded && (
            <div
              className={cn(
                "absolute inset-0 transition-[opacity,transform] duration-150",
                expanded ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-2 opacity-0"
              )}
            >
              {expandedTable}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
