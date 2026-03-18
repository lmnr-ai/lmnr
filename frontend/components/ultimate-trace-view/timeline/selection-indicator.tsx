import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SelectionIndicatorProps {
  selectedCount: number;
  onClear: () => void;
}

export default function SelectionIndicator({ selectedCount, onClear }: SelectionIndicatorProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute top-1.5 right-1.5 z-40 flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-2 h-[24px] text-xs">
      <span>{selectedCount} spans selected</span>
      <Button variant="ghost" size="icon" className="size-4 min-w-4 hover:bg-primary/80" onClick={onClear}>
        <X className="size-3" />
      </Button>
    </div>
  );
}
