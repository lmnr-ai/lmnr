"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

// Long enough that sweeping the pointer across a table doesn't pop previews open.
const OPEN_DELAY_MS = 400;
// Grace period to move the pointer from the trigger into the preview.
const CLOSE_DELAY_MS = 150;

interface HoverPreviewProps {
  side?: "top" | "bottom" | "left" | "right";
  /** Rendered only while open; `close` dismisses it (e.g. after navigating). */
  content: (close: () => void) => ReactNode;
  children: ReactNode;
}

/**
 * Open state driven by hover: `show` after a short dwell, `hide` after a grace period. Wire both to
 * every surface that should keep it open (trigger, content, nested sub-content).
 */
export function useHoverOpen() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const schedule = useCallback((next: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), next ? OPEN_DELAY_MS : CLOSE_DELAY_MS);
  }, []);
  const show = useCallback(() => schedule(true), [schedule]);
  const hide = useCallback(() => schedule(false), [schedule]);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { open, setOpen, show, hide, close };
}

/** Hover card for an id (session, user): opens after a short dwell and stays open while hovered. */
export default function HoverPreview({ side = "bottom", content, children }: HoverPreviewProps) {
  const { open, setOpen, show, hide, close } = useHoverOpen();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className="block min-w-0" onMouseEnter={show} onMouseLeave={hide}>
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side={side}
        align="start"
        className="w-auto overflow-hidden p-0"
        onMouseEnter={show}
        onMouseLeave={hide}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Rendered through a portal, but React events still bubble to the table row underneath.
        onClick={(e) => e.stopPropagation()}
      >
        {open && content(close)}
      </PopoverContent>
    </Popover>
  );
}
