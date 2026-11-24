"use client";

import { memo, type RefObject, useMemo, useRef } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { type AdvancedSearchRefs, AdvancedSearchRefsProvider, useAdvancedSearchRefsContext } from "../store";
import { type AdvancedSearchResource, type FilterTag as FilterTagType } from "../types";
import FilterTag from "./tag";

interface HiddenFiltersChipProps {
  hiddenTags: FilterTagType[];
  selectedTagIds: Set<string>;
  resource?: AdvancedSearchResource;
}

const HiddenFiltersChip = ({ hiddenTags, selectedTagIds, resource }: HiddenFiltersChipProps) => {
  const { tagHandlesRef } = useAdvancedSearchRefsContext();
  const contentRef = useRef<HTMLDivElement>(null);
  // Edits return focus to the "main input"; inside the popover it must stay there or Radix closes it.
  const popoverRefs = useMemo<AdvancedSearchRefs>(
    () => ({ mainInputRef: contentRef as unknown as RefObject<HTMLInputElement | null>, tagHandlesRef }),
    [tagHandlesRef]
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-selected={hiddenTags.some((tag) => selectedTagIds.has(tag.id))}
          className={cn(
            "inline-flex items-center shrink-0 h-6 px-1.5 rounded-md border bg-background text-xs font-medium",
            "text-secondary-foreground hover:overlay-hover cursor-pointer transition-all",
            "data-[selected=true]:border-primary data-[selected=true]:ring-1 data-[selected=true]:ring-primary/60"
          )}
          aria-label={`${hiddenTags.length} more filters`}
          onClick={(e) => e.stopPropagation()}
        >
          +{hiddenTags.length}
        </button>
      </PopoverTrigger>
      {/* Portal clicks bubble to the bar, whose onClick would refocus the main input. */}
      <PopoverContent
        ref={contentRef}
        tabIndex={-1}
        align="start"
        className="w-auto max-w-[min(90vw,48rem)] p-2 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <AdvancedSearchRefsProvider value={popoverRefs}>
          <div className="flex flex-col items-start gap-1">
            {hiddenTags.map((tag) => (
              <FilterTag key={tag.id} tag={tag} resource={resource} isSelected={selectedTagIds.has(tag.id)} />
            ))}
          </div>
        </AdvancedSearchRefsProvider>
      </PopoverContent>
    </Popover>
  );
};

export default memo(HiddenFiltersChip);
