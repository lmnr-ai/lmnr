import { X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";

import { type SelectionPanelProps } from "../model/types.ts";

export function SelectionPanel({ selectedRowIds, onClearSelection, selectionPanel }: SelectionPanelProps) {
  if (selectedRowIds.length === 0) return null;

  return (
    <div className="h-12 flex pl-4 pr-3 items-center border-primary/50 border rounded-lg absolute bottom-4 z-50 left-1/2 transform -translate-x-1/2 bg-surface-200 gap-2">
      <div className="flex gap-4 items-center">
        <Label>
          {`${selectedRowIds.length} ${selectedRowIds.length === 1 ? "row " : "rows "}`}
          selected
        </Label>
        {selectionPanel?.(selectedRowIds)}
      </div>
      <Button aria-label="Clear selection" variant="ghost" onClick={onClearSelection} size="icon">
        <X size={12} />
      </Button>
    </div>
  );
}
