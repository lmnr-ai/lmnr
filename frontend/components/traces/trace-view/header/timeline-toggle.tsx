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
        "absolute z-40 top-full flex items-end overflow-hidden transition-all duration-200",
        enabled
          ? "right-0 h-6 w-7 bg-muted border-b border-l rounded-none rounded-bl "
          : "right-2 h-6 bg-background border rounded-md hover:bg-muted",
        className
      )}
    >
      <Button
        onClick={() => setEnabled(!enabled)}
        variant="ghost"
        size="icon"
        className={cn("transition-all duration-200", enabled ? "size-5 min-w-5" : "h-6 w-auto px-1.5 text-xs")}
      >
        {enabled ? (
          <X className="size-3.5" />
        ) : (
          <span className="flex items-center text-xs h-6 gap-1">
            <GanttChart size={14} />
            Timeline
          </span>
        )}
      </Button>
    </div>
  );
}
