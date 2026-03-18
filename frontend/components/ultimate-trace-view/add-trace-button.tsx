"use client";

import { Plus } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";

import { useUltimateTraceViewStore } from "./store";

export default function AddTraceButton() {
  const openTracePickerPanel = useUltimateTraceViewStore((state) => state.openTracePickerPanel);

  const handleClick = useCallback(() => {
    openTracePickerPanel();
  }, [openTracePickerPanel]);

  return (
    <div className="flex items-center justify-center py-4 border-t border-dashed">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClick}>
        <Plus className="size-3.5" />
        Add trace
      </Button>
    </div>
  );
}
