"use client";

import { Search } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "./context";
import { ColumnFilter } from "./types";

interface FieldSuggestion {
  type: "field";
  filter: ColumnFilter;
}

interface RawSearchSuggestion {
  type: "raw_search";
  value: string;
}

export type Suggestion = FieldSuggestion | RawSearchSuggestion;

interface SuggestionsDropdownProps {
  className?: string;
}

const SuggestionsDropdown = ({ className }: SuggestionsDropdownProps) => {
  const { state, filters, addTag, setInputValue, setIsOpen, submit, setIsAddingTag } = useFilterSearch();
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const suggestions = useMemo((): Suggestion[] => {
    const input = state.inputValue.trim().toLowerCase();

    if (!input) {
      return filters.map((filter) => ({
        type: "field",
        filter,
      }));
    }

    const matchingFields = filters.filter(
      (f) => f.name.toLowerCase().includes(input) || f.key.toLowerCase().includes(input)
    );

    const fieldSuggestions: Suggestion[] = matchingFields.map((filter) => ({
      type: "field",
      filter,
    }));

    fieldSuggestions.push({
      type: "raw_search",
      value: state.inputValue.trim(),
    });

    return fieldSuggestions;
  }, [state.inputValue, filters]);

  useEffect(() => {
    const activeItem = itemRefs.current.get(state.activeIndex);
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [state.activeIndex]);

  const handleFieldSelect = useCallback(
    (filter: ColumnFilter) => {
      setIsAddingTag(true);
      addTag(filter.key);
    },
    [addTag, setIsAddingTag]
  );

  const handleRawSearchSelect = useCallback(
    (value: string) => {
      setInputValue(`"${value}"`);
      setIsOpen(false);
      submit();
    },
    [setInputValue, setIsOpen, submit]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  if (!state.isOpen || suggestions.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute top-full left-0 right-0 z-50 mt-1 bg-secondary border rounded-md shadow-md overflow-hidden",
        className
      )}
    >
      <div className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
        {state.inputValue.trim() ? "Suggestions" : "Filter by"}
      </div>
      <ScrollArea className="max-h-64">
        <div className="pb-1">
          {suggestions.map((suggestion, idx) => {
            const isActive = idx === state.activeIndex;

            if (suggestion.type === "field") {
              return (
                <div
                  key={`field-${suggestion.filter.key}`}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs cursor-pointer font-medium text-secondary-foreground",
                    isActive ? "bg-accent" : "hover:bg-accent"
                  )}
                  onMouseDown={handleMouseDown}
                  onClick={() => handleFieldSelect(suggestion.filter)}
                >
                  {suggestion.filter.name}
                </div>
              );
            }

            // Raw search suggestion
            return (
              <div
                key="raw-search"
                ref={(el) => {
                  if (el) itemRefs.current.set(idx, el);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer text-secondary-foreground border-t mt-1 pt-2",
                  isActive ? "bg-accent" : "hover:bg-accent"
                )}
                onMouseDown={handleMouseDown}
                onClick={() => handleRawSearchSelect(suggestion.value)}
              >
                <Search className="w-3 h-3" />
                <span className="text-muted-foreground">Full text search:</span>
                <span className="font-medium">&quot;{suggestion.value}&quot;</span>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

// Export suggestions count helper for keyboard navigation
export const getSuggestionsCount = (filters: ColumnFilter[], inputValue: string): number => {
  const input = inputValue.trim().toLowerCase();
  if (!input) {
    return filters.length;
  }
  const matchingFields = filters.filter(
    (f) => f.name.toLowerCase().includes(input) || f.key.toLowerCase().includes(input)
  );
  return matchingFields.length + 1; // +1 for raw search option
};

export const getSuggestionAtIndex = (
  filters: ColumnFilter[],
  inputValue: string,
  index: number
): Suggestion | null => {
  const input = inputValue.trim().toLowerCase();

  if (!input) {
    if (index < filters.length) {
      return { type: "field", filter: filters[index] };
    }
    return null;
  }

  const matchingFields = filters.filter(
    (f) => f.name.toLowerCase().includes(input) || f.key.toLowerCase().includes(input)
  );

  if (index < matchingFields.length) {
    return { type: "field", filter: matchingFields[index] };
  }

  if (index === matchingFields.length) {
    return { type: "raw_search", value: inputValue.trim() };
  }

  return null;
};

export default memo(SuggestionsDropdown);
