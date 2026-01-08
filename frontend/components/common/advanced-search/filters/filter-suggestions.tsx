"use client";

import { Search } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Operator } from "@/lib/actions/common/operators";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { ColumnFilter } from "../types";

interface FieldSuggestion {
  type: "field";
  filter: ColumnFilter;
}

interface ValueSuggestion {
  type: "value";
  field: string;
  value: string;
}

interface RawSearchSuggestion {
  type: "raw_search";
  value: string;
}

export type Suggestion = FieldSuggestion | ValueSuggestion | RawSearchSuggestion;

interface FilterSuggestionsProps {
  className?: string;
}

const FilterSuggestions = ({ className }: FilterSuggestionsProps) => {
  const { state, filters, addTag, addCompleteTag, setInputValue, setIsOpen, submit, setIsAddingTag, autocompleteData, focusMainInput } = useFilterSearch();
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

    // Add value suggestions from preloaded autocomplete data
    const valueSuggestions: Suggestion[] = [];
    autocompleteData.forEach((values, field) => {
      const matchingValues = values.filter((value) => value.toLowerCase().includes(input));
      matchingValues.forEach((value) => {
        valueSuggestions.push({
          type: "value",
          field,
          value,
        });
      });
    });

    // Combine field suggestions, value suggestions, and raw search
    const allSuggestions = [...fieldSuggestions, ...valueSuggestions];

    allSuggestions.push({
      type: "raw_search",
      value: state.inputValue.trim(),
    });

    return allSuggestions;
  }, [state.inputValue, filters, autocompleteData]);

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

  const handleValueSelect = useCallback(
    (field: string, value: string) => {
      // Find the filter to get the proper field key
      const columnFilter = filters.find((f) => f.key === field);
      if (!columnFilter) return;

      // Add a complete tag - it will submit automatically
      addCompleteTag(field, Operator.Eq, value);

      // Keep focus on main input
      focusMainInput();
    },
    [filters, addCompleteTag, focusMainInput]
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
      <ScrollArea className="max-h-64 [&>div]:max-h-64">
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

            if (suggestion.type === "value") {
              // Find the filter name for display
              const filterForField = filters.find((f) => f.key === suggestion.field);
              const displayName = filterForField?.name || suggestion.field;

              return (
                <div
                  key={`value-${suggestion.field}-${suggestion.value}-${idx}`}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs cursor-pointer text-secondary-foreground",
                    isActive ? "bg-accent" : "hover:bg-accent"
                  )}
                  onMouseDown={handleMouseDown}
                  onClick={() => handleValueSelect(suggestion.field, suggestion.value)}
                >
                  <span className="text-muted-foreground">{displayName}:</span>{" "}
                  <span className="font-medium">{suggestion.value}</span>
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

export const getSuggestionsCount = (
  filters: ColumnFilter[],
  inputValue: string,
  autocompleteData: Map<string, string[]>
): number => {
  const input = inputValue.trim().toLowerCase();
  if (!input) {
    return filters.length;
  }

  const matchingFields = filters.filter(
    (f) => f.name.toLowerCase().includes(input) || f.key.toLowerCase().includes(input)
  );

  // Count matching values from autocomplete data
  let valueCount = 0;
  autocompleteData.forEach((values) => {
    valueCount += values.filter((value) => value.toLowerCase().includes(input)).length;
  });

  return matchingFields.length + valueCount + 1; // +1 for raw search option
};

export const getSuggestionAtIndex = (
  filters: ColumnFilter[],
  inputValue: string,
  index: number,
  autocompleteData: Map<string, string[]>
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

  // Build value suggestions
  const valueSuggestions: Array<{ field: string; value: string }> = [];
  autocompleteData.forEach((values, field) => {
    const matchingValues = values.filter((value) => value.toLowerCase().includes(input));
    matchingValues.forEach((value) => {
      valueSuggestions.push({ field, value });
    });
  });

  const valueIndex = index - matchingFields.length;
  if (valueIndex < valueSuggestions.length) {
    const { field, value } = valueSuggestions[valueIndex];
    return { type: "value", field, value };
  }

  if (index === matchingFields.length + valueSuggestions.length) {
    return { type: "raw_search", value: inputValue.trim() };
  }

  return null;
};

export default memo(FilterSuggestions);
