import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { SelectionPanelProps } from "./types";

export function SelectionPanel({ selectedRowIds, onClearSelection, selectionPanel }: SelectionPanelProps) {
  if (selectedRowIds.length === 0) return null;

  return (
    <div className="bg-background h-12 flex flex-none px-4 items-center border-primary border-[1.5px] rounded-lg absolute bottom-4 z-50 left-1/2 transform -translate-x-1/2">
      <Label>
        {`${selectedRowIds.length} ${selectedRowIds.length === 1 ? "row " : "rows "}`}
        selected
      </Label>
      <Button variant="ghost" onClick={onClearSelection}>
        <X size={12} />
      </Button>
      {selectionPanel?.(selectedRowIds)}
    </div>
  );
}
