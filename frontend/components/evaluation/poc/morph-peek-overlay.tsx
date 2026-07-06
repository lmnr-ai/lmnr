"use client";

import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";

interface MorphPeekOverlayProps {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Full-table lightbox for narrow morph tiers. Closes on Escape, and on any row
 * click inside the table (the whole point is a quick look, then back to the trace).
 */
export default function MorphPeekOverlay({ onClose, children }: MorphPeekOverlayProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Row click closes the peek; capture-phase so it fires before the table's own
  // row-click handler navigates/selects.
  const closeOnRowClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[role="row"], tr')) setTimeout(onClose, 0);
    },
    [onClose]
  );

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col overflow-hidden rounded-md border bg-background"
      onClickCapture={closeOnRowClick}
    >
      <div className="flex flex-none items-center justify-between border-b px-2 py-1.5">
        <span className="text-xs font-medium text-secondary-foreground">Full table</span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose} title="Close">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
