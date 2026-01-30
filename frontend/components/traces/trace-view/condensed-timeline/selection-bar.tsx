import React, { memo } from "react";

import { Button } from "@/components/ui/button";

interface SelectionBarProps {
  selectedCount: number;
  onClear: () => void;
}

const SelectionBar = ({ selectedCount, onClear }: SelectionBarProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 w-full h-6 bg-muted/80 border-t flex items-center justify-between pl-3 pr-1 z-30 pointer-events-none">
      <span className="text-xs text-muted-foreground">
        Selected <span className="font-medium text-foreground">{selectedCount}</span> span
        {selectedCount !== 1 ? "s" : ""}
      </span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs pointer-events-auto" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
};

export default memo(SelectionBar);
