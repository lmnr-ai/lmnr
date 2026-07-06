"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface HoverNavFlyoutProps {
  spineWidth: number;
  expanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: ReactNode;
}

/**
 * The full-table surface for hover-flyout mode: a second box sliding out
 * beside the (static) spine via transform, not width, so nothing reflows.
 */
export default function HoverNavFlyout({
  spineWidth,
  expanded,
  onMouseEnter,
  onMouseLeave,
  children,
}: HoverNavFlyoutProps) {
  return (
    <div
      className={cn(
        "absolute top-0 z-30 h-full overflow-hidden rounded-md border bg-background shadow-lg transition-[opacity,transform] duration-200",
        expanded ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-4 opacity-0"
      )}
      style={{ left: spineWidth, width: `calc(80% - ${spineWidth}px)` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
