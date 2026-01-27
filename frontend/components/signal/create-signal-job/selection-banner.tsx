import { CheckCircle2, Info, X } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button.tsx";

interface SelectionBannerProps {
  selectionMode: "none" | "page" | "all";
  selectedCount: number;
  traceCount: number;
  loadedTraceCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

const SelectionBanner = ({
  selectionMode,
  selectedCount,
  traceCount,
  loadedTraceCount,
  onSelectAll,
  onClearSelection,
}: SelectionBannerProps) => {
  if (traceCount === 0) return null;

  if (selectionMode === "none") {
    return (
      <div className="flex items-center gap-2 px-2 text-secondary-foreground">
        <Info className="size-4 text-muted-foreground shrink-0 my-1.5" />
        <div className="flex-1 text-sm">
          <span className="font-medium">{traceCount.toLocaleString()}</span> traces total
        </div>
      </div>
    );
  }

  if (selectionMode === "all") {
    return (
      <div className="flex items-center gap-2 px-2">
        <CheckCircle2 className="size-4 text-primary shrink-0" />
        <div className="flex-1 text-sm text-secondary-foreground">
          All <span className="font-medium">{traceCount.toLocaleString()}</span> matching traces selected
        </div>
        <Button variant="ghost" size="icon" onClick={onClearSelection}>
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  const hasUnloadedTraces = traceCount > loadedTraceCount;

  return (
    <div className="flex items-center gap-2 px-2 text-secondary-foreground">
      <Info className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium">{selectedCount.toLocaleString()}</span> traces selected.
        {hasUnloadedTraces && (
          <Button variant="link" size="sm" onClick={onSelectAll} className="h-auto p-0 ml-1 text-sm font-medium">
            Select all {traceCount.toLocaleString()} matching traces
          </Button>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onClearSelection}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
};

export default SelectionBanner;
