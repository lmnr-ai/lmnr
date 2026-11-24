"use client";

import { Search } from "lucide-react";
import React, { memo, useCallback, useEffect, useRef } from "react";

import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { type RecentSearch, useAdvancedSearchContext, useSuggestions } from "../store";
import { type ColumnFilter, createTagFromFilter } from "../types";
import { displayFilterValue, type Suggestion } from "../utils";

const RecentSearchChip = ({
  recentSearch,
  columnFilters,
  isActive,
  onSelect,
  ref,
}: {
  recentSearch: RecentSearch;
  columnFilters: ColumnFilter[];
  isActive: boolean;
  onSelect: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) => {
  const tags = recentSearch.filters.map(createTagFromFilter);

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md border h-6 text-xs divide-x px-0.5 cursor-pointer shrink-0 transition-colors",
        isActive ? "bg-surface-500 border-primary/40" : "bg-background hover:overlay-hover"
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={onSelect}
    >
      {tags.map((tag) => {
        const colFilter = columnFilters.find((f) => f.key === tag.field);
        const displayName = colFilter?.name ?? tag.field;
        const operatorLabel = OperatorLabelMap[tag.operator] ?? tag.operator;
        const displayValue = displayFilterValue(colFilter, tag.value);

        return (
          <span key={tag.id} className="inline-flex items-center gap-1 px-1.5 h-4">
            <span className="text-secondary-foreground font-medium">{displayName}</span>
            <span className="text-secondary-foreground/80">{operatorLabel}</span>
            <span className="text-primary-text">{displayValue}</span>
          </span>
        );
      })}
      {recentSearch.search && (
        <span className="px-1 text-secondary-foreground truncate">&quot;{recentSearch.search}&quot;</span>
      )}
    </div>
  );
};

interface FilterSuggestionsProps {
  className?: string;
}

const FilterSuggestions = ({ className }: FilterSuggestionsProps) => {
  const inputValue = useAdvancedSearchContext((state) => state.inputValue);
  const isOpen = useAdvancedSearchContext((state) => state.isOpen);
  const activeIndex = useAdvancedSearchContext((state) => state.activeIndex);
  const activeRecentIndex = useAdvancedSearchContext((state) => state.activeRecentIndex);
  const filters = useAdvancedSearchContext((state) => state.filters);
  const hasTags = useAdvancedSearchContext((state) => state.tags.length > 0);
  const recentSearches = useAdvancedSearchContext((state) => state.recentSearches);
  const { applySuggestion, applyRecentSearch } = useAdvancedSearchContext((state) => ({
    applySuggestion: state.applySuggestion,
    applyRecentSearch: state.applyRecentSearch,
  }));
  const suggestions = useSuggestions();

  const suggestionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const recentChipRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const recentContainerRef = useRef<HTMLDivElement>(null);

  const showRecent = !inputValue.trim() && !hasTags && recentSearches.length > 0;

  useEffect(() => {
    const activeElement = suggestionRefs.current.get(activeIndex);
    if (activeElement) {
      activeElement.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  useEffect(() => {
    const chip = recentChipRefs.current.get(activeRecentIndex);
    const container = recentContainerRef.current;
    if (!chip || !container) return;

    const chipLeft = chip.offsetLeft;
    const chipRight = chipLeft + chip.offsetWidth;
    const scrollLeft = container.scrollLeft;
    const visibleRight = scrollLeft + container.clientWidth;

    if (chipLeft < scrollLeft) {
      container.scrollTo({ left: chipLeft - 12, behavior: "smooth" });
    } else if (chipRight > visibleRight) {
      container.scrollTo({ left: chipRight - container.clientWidth + 12, behavior: "smooth" });
    }
  }, [activeRecentIndex]);

  const handleSelect = useCallback((suggestion: Suggestion) => applySuggestion(suggestion), [applySuggestion]);

  if (!isOpen || (suggestions.length === 0 && !showRecent)) return null;

  return (
    <div
      className={cn(
        "absolute top-full left-0 right-0 z-50 mt-1 bg-secondary border rounded-md shadow-md overflow-hidden",
        className
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      {showRecent && (
        <div className="border-b">
          <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground font-medium tracking-wide">Recent searches</div>
          <div
            ref={recentContainerRef}
            className="flex items-center gap-1.5 px-3 pb-2 pt-1 overflow-x-auto no-scrollbar"
          >
            {recentSearches.map((rs, idx) => (
              <RecentSearchChip
                key={rs.timestamp}
                ref={(el) => {
                  if (el) recentChipRefs.current.set(idx, el);
                }}
                recentSearch={rs}
                columnFilters={filters}
                isActive={activeRecentIndex === idx}
                onSelect={() => applyRecentSearch(rs)}
              />
            ))}
          </div>
        </div>
      )}
      {suggestions.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground font-medium tracking-wide">
            {inputValue.trim() ? "Suggestions" : "Filter by"}
          </div>
          <ScrollArea className="max-h-64 [&>div]:max-h-64">
            <div className="pb-1">
              {suggestions.map((suggestion, idx) => {
                const isActive = idx === activeIndex;

                if (suggestion.type === "field") {
                  return (
                    <div
                      key={`field-${suggestion.filter.key}`}
                      ref={(el) => {
                        if (el) suggestionRefs.current.set(idx, el);
                      }}
                      className={cn(
                        "px-3 py-1.5 text-xs cursor-pointer font-medium text-secondary-foreground",
                        isActive ? "bg-surface-500" : "hover:overlay-hover"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => handleSelect(suggestion)}
                    >
                      {suggestion.filter.name}
                    </div>
                  );
                }

                if (suggestion.type === "value") {
                  const filterForField = filters.find((f) => f.key === suggestion.field);
                  const displayName = filterForField?.name || suggestion.field;

                  return (
                    <div
                      key={`value-${suggestion.field}-${suggestion.value}-${idx}`}
                      ref={(el) => {
                        if (el) suggestionRefs.current.set(idx, el);
                      }}
                      className={cn(
                        "px-3 py-1.5 text-xs cursor-pointer text-secondary-foreground",
                        isActive ? "bg-surface-500" : "hover:overlay-hover"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => handleSelect(suggestion)}
                    >
                      <span className="text-muted-foreground">{displayName}:</span>{" "}
                      <span className="font-medium">{suggestion.label ?? suggestion.value}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key="raw-search"
                    ref={(el) => {
                      if (el) suggestionRefs.current.set(idx, el);
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer text-secondary-foreground border-t mt-1 pt-2",
                      isActive ? "bg-surface-500" : "hover:overlay-hover"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => handleSelect(suggestion)}
                  >
                    <Search className="w-3 h-3" />
                    <span className="text-muted-foreground">Full text search:</span>
                    <span className="font-medium">&quot;{suggestion.value}&quot;</span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
};

export default memo(FilterSuggestions);
