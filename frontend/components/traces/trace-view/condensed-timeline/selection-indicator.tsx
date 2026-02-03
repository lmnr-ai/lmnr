import React, { memo } from "react";

interface SelectionIndicatorProps {
  selectedCount: number;
  onClear: () => void;
}

const SelectionIndicator = ({ selectedCount, onClear }: SelectionIndicatorProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-40">
      <button
        onClick={onClear}
        className="flex items-center gap-1.5 px-2 h-[24px] bg-landing-surface-500 border border-landing-text-600 text-landing-text-200 text-xs rounded-full shadow-md hover:bg-landing-surface-400"
        aria-label={`Clear selection of ${selectedCount} spans`}
      >
        <span>Clear selection ({selectedCount})</span>
      </button>
    </div>
  );
};

export default memo(SelectionIndicator);
