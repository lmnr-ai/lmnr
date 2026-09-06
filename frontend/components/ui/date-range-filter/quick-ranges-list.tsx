"use client";

import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";

import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";

import { exceedsRetention, RANGE_ITEM_CLASS, RangeItem } from "./range-item";
import { type DateRange, getSuggestedRanges, QUICK_RANGES } from "./utils.ts";

export const QuickRangesList = ({
  pastHours,
  onSelect,
  onAbsoluteClick,
  maxHours,
  billingHref,
  ranges = QUICK_RANGES,
  hideAbsoluteDate = false,
}: {
  pastHours: string | null;
  onSelect: (value: string) => void;
  onAbsoluteClick: () => void;
  maxHours?: number;
  billingHref?: string;
  ranges?: DateRange[];
  hideAbsoluteDate?: boolean;
}) => {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const displayedRanges = useMemo(() => getSuggestedRanges(query, ranges), [query, ranges]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const nextRanges = getSuggestedRanges(value, ranges);
    setHighlightIndex(value.trim() === "" ? -1 : nextRanges.findIndex((range) => !exceedsRetention(range, maxHours)));
  };

  const selectAt = (index: number) => {
    const range = displayedRanges[index];
    if (!range || exceedsRetention(range, maxHours)) return;
    onSelect(range.value);
  };

  const moveHighlight = (direction: 1 | -1) => {
    if (displayedRanges.length === 0) return;
    let next = highlightIndex < 0 ? (direction === 1 ? -1 : 0) : highlightIndex;
    for (let i = 0; i < displayedRanges.length; i++) {
      next = (next + direction + displayedRanges.length) % displayedRanges.length;
      if (!exceedsRetention(displayedRanges[next], maxHours)) {
        setHighlightIndex(next);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectAt(highlightIndex);
    }
  };

  return (
    <motion.div
      key="ranges"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      <div className="p-1 w-62">
        <div className="p-1">
          <Input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="4 hours, 8 days..."
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div role="listbox">
          {displayedRanges.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching ranges</div>
          ) : (
            displayedRanges.map((range, index) => (
              <RangeItem
                key={`${range.value}-${range.name}`}
                range={range}
                isSelected={pastHours === range.value}
                isHighlighted={highlightIndex === index}
                maxHours={maxHours}
                billingHref={billingHref}
                onSelect={onSelect}
                onHighlight={() => setHighlightIndex(index)}
              />
            ))
          )}
          {!hideAbsoluteDate && (
            <div
              className={cn(
                RANGE_ITEM_CLASS,
                "cursor-pointer justify-between hover:bg-accent hover:text-accent-foreground font-medium"
              )}
              onClick={onAbsoluteClick}
              onMouseEnter={() => setHighlightIndex(-1)}
            >
              <span>Absolute date</span>
              <ChevronRight className="size-4" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
