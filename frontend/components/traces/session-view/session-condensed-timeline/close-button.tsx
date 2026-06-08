import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CloseButtonProps {
  onClose: () => void;
}

/** Absolutely-positioned X in the top-right of the session condensed timeline.
 *  Styled to match the trace-view timeline-toggle's open/`enabled`-state X
 *  (only the position anchor changes from `top-full` to `top-0`). */
export default function CloseButton({ onClose }: CloseButtonProps) {
  return (
    <div className="absolute z-40 top-0 right-0 flex items-end overflow-hidden h-6 w-7 bg-muted border-b border-l rounded-none rounded-bl">
      <Button onClick={onClose} variant="ghost" size="icon" className="size-5 min-w-5">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
