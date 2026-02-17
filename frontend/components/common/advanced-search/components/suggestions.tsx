"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import { dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Operator } from "@/lib/actions/common/operators";
import { cn } from "@/lib/utils";

import { useAdvancedSearchContext, useAdvancedSearchRefsContext } from "../store";
import { type ColumnFilter } from "../types";
import { buildValueSuggestions } from "../utils";

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

export const buildSuggestions = (
  inputValue: string,
  filters: ColumnFilter[],
  autocompleteData: Map<string, string[]>
): Suggestion[] => {
  const input = inputValue.trim().toLowerCase();

  if (!input) {
    return filters.map((filter) => ({ type: "field" as const, filter }));
  }

  const matchingFields = filters.filter(
    (f) => f.name.toLowerCase().includes(input) || f.key.toLowerCase().includes(input)
  );

  const fieldSuggestions: Suggestion[] = matchingFields.map((filter) => ({
    type: "field" as const,
    filter,
  }));

  const valueSuggestions: Suggestion[] = buildValueSuggestions(input, filters, autocompleteData).map(
    ({ field, value }) => ({ type: "value" as const, field, value })
  );

  return [...fieldSuggestions, ...valueSuggestions, { type: "raw_search" as const, value: inputValue.trim() }];
};

interface FilterSuggestionsProps {
  className?: string;
}

const FilterSuggestions = ({ className }: FilterSuggestionsProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const inputValue = useAdvancedSearchContext((state) => state.inputValue);
  const isOpen = useAdvancedSearchContext((state) => state.isOpen);
  const activeIndex = useAdvancedSearchContext((state) => state.activeIndex);
  const filters = useAdvancedSearchContext((state) => state.filters);
  const autocompleteData = useAdvancedSearchContext((state) => state.autocompleteData);

  const { addTag, addCompleteTag, setInputValue, setIsOpen, submit } = useAdvancedSearchContext((state) => ({
    addTag: state.addTag,
    addCompleteTag: state.addCompleteTag,
    setInputValue: state.setInputValue,
    setIsOpen: state.setIsOpen,
    submit: state.submit,
  }));

  const { mainInputRef } = useAdvancedSearchRefsContext();

  const suggestionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const suggestions = useMemo(
    () => buildSuggestions(inputValue, filters, autocompleteData),
    [inputValue, filters, autocompleteData]
  );

  useEffect(() => {
    const activeElement = suggestionRefs.current.get(activeIndex);
    if (activeElement) {
      activeElement.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleValueSelect = useCallback(
    (field: string, value: string) => {
      // Find the filter to get the proper field key and default operator
      const columnFilter = filters.find((f) => f.key === field);
      if (!columnFilter) return;

      // Get the default operator for this field's dataType
      const defaultOperator = dataTypeOperationsMap[columnFilter.dataType]?.[0]?.key ?? Operator.Eq;
      addCompleteTag(field, defaultOperator, value, router, pathname, searchParams);

      // Keep focus on main input
      mainInputRef.current?.focus();
    },
    [filters, addCompleteTag, router, pathname, searchParams, mainInputRef]
  );

  const handleRawSearchSelect = useCallback(
    (value: string) => {
      setInputValue(value);
      setIsOpen(false);
      submit(router, pathname, searchParams);
    },
    [setInputValue, setIsOpen, submit, router, pathname, searchParams]
  );

  if (!isOpen || suggestions.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute top-full left-0 right-0 z-50 mt-1 bg-secondary border rounded-md shadow-md overflow-hidden",
        className
      )}
    >
      <div className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
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
                    isActive ? "bg-accent" : "hover:bg-accent"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => addTag(suggestion.filter.key)}
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
                    if (el) suggestionRefs.current.set(idx, el);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs cursor-pointer text-secondary-foreground",
                    isActive ? "bg-accent" : "hover:bg-accent"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
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
                  if (el) suggestionRefs.current.set(idx, el);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer text-secondary-foreground border-t mt-1 pt-2",
                  isActive ? "bg-accent" : "hover:bg-accent"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
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

export default memo(FilterSuggestions);
