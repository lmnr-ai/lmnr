import { GanttChart, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CondensedTimelineControlsProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  className?: string;
}

export default function CondensedTimelineControls({ enabled, setEnabled, className }: CondensedTimelineControlsProps) {
  return (
    <div
      className={cn(
        "absolute z-40 top-full flex items-center overflow-hidden transition-all duration-200",
        enabled ? "right-0 h-[26px] w-[26px] rounded-none rounded-bl" : "right-2 h-[26px] rounded-md",
        className
      )}
    >
      <Button
        onClick={() => setEnabled(!enabled)}
        variant="ghost"
        size="icon"
        className={cn(
          "transition-all duration-200 hover:bg-surface-up-3",
          enabled ? "size-[26px] min-w-[26px] rounded-none rounded-bl" : "h-full w-auto px-2 py-0 text-xs"
        )}
      >
        {enabled ? (
          <X className="size-3.5" />
        ) : (
          <span className="flex h-[26px] items-center gap-1 text-xs">
            <GanttChart size={14} />
            Timeline
          </span>
        )}
      </Button>
    </div>
  );
}
