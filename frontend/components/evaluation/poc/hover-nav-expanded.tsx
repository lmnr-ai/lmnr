"use client";

import { Pin, PinOff } from "lucide-react";
import { type ReactNode, useCallback } from "react";

import { Button } from "@/components/ui/button";

interface HoverNavExpandedProps {
  children: ReactNode;
  onRowSelected: () => void;
  showPin?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
}

/**
 * The expanded full-table surface shared by all three hover-nav variants
 * (nested inline for reveal/pin, or hosted in a separate flyout box for
 * hover-flyout). Any row click collapses back to the sidenav; hover-pin adds
 * a pin toggle so the surface can be locked open past mouseleave.
 */
export default function HoverNavExpanded({
  children,
  onRowSelected,
  showPin,
  pinned,
  onTogglePin,
}: HoverNavExpandedProps) {
  const closeOnRowClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[role="row"], tr')) setTimeout(onRowSelected, 0);
    },
    [onRowSelected]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden" onClickCapture={closeOnRowClick}>
      {showPin && (
        <div className="flex flex-none items-center justify-end border-b px-2 py-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onTogglePin}
            title={pinned ? "Unpin" : "Pin table open"}
          >
            {pinned ? <Pin className="size-3.5 text-primary" /> : <PinOff className="size-3.5" />}
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
