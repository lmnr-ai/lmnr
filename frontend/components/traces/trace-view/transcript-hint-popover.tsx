import { X } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const TRANSCRIPT_HINT_STORAGE_KEY = "trace-view:transcript-hint-dismissed";

interface TranscriptHintPopoverProps {
  /**
   * Render function for the anchor element. Receives `open` so the trigger
   * can visually indicate the hint is active (e.g. highlight border).
   * Must return a single element that forwards refs (e.g. a DropdownMenuTrigger).
   */
  children: (state: { open: boolean }) => ReactNode;
}

export default function TranscriptHintPopover({ children }: TranscriptHintPopoverProps) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !localStorage.getItem(TRANSCRIPT_HINT_STORAGE_KEY);
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(TRANSCRIPT_HINT_STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  };

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>{children({ open })}</PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-80 p-3 border-primary/60 shadow-lg shadow-primary/10"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 text-xs leading-relaxed">
            <div className="font-medium text-primary mb-1">New: Transcript view</div>
            <p className="text-foreground/80">
              See what your agents were asked to do and a breakdown of what each agent did. Switch to Tree anytime for
              detailed, span-by-span inspection.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1 rounded-md hover:bg-secondary"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
