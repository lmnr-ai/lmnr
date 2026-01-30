import React, { memo } from "react";

interface SelectionIndicatorProps {
  selectedCount: number;
  onClear: () => void;
}

const SelectionIndicator = ({ selectedCount, onClear }: SelectionIndicatorProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-[2px] left-1/2 -translate-x-1/2 z-40">
      <button
        onClick={onClear}
        className="flex items-center gap-1.5 px-2.5 py-[2px] bg-primary text-primary-foreground text-xs rounded-lg shadow-md hover:bg-primary/90"
        aria-label={`Clear selection of ${selectedCount} spans`}
      >
        <span>Clear selection ({selectedCount})</span>
      </button>
    </div>
  );
};

export default memo(SelectionIndicator);
