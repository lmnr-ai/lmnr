"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SuggestedColumnHeaderProps {
  name: string;
  onKeep: () => void;
  onDiscard: () => void;
}

/**
 * Header for a not-yet-accepted suggested column. Shows the name with a
 * sparkles marker; hovering opens a popover asking to keep or discard. The
 * popover stays open while the pointer moves between the header and the
 * content (shared close timer) so its buttons are clickable.
 */
export function SuggestedColumnHeader({ name, onKeep, onDiscard }: SuggestedColumnHeaderProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="flex w-full min-w-0 items-center justify-between gap-2 pr-2"
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          // Header is a drag handle; don't let the trigger hijack pointer/click.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="truncate">{name}</span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-400/30 bg-blue-400/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
            <Sparkles className="size-2.5" />
            Suggested
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={12}
        className="w-64 p-3"
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-3.5 text-blue-400" />
            Custom column suggestion
          </div>
          <p className="text-xs text-muted-foreground">Would you like to keep the custom &quot;{name}&quot; column?</p>
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onDiscard}>
              Discard
            </Button>
            <Button size="sm" onClick={onKeep}>
              Keep
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
