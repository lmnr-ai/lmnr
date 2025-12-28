"use client";

import { Command as CommandPrimitive } from "cmdk";
import { isNil, uniqBy } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import FilterInputArea from "@/components/traces/traces-table/filter-input-area";
import FilterSuggestions, { Suggestion } from "@/components/traces/traces-table/filter-suggestions";
import { FilterTagState } from "@/components/traces/traces-table/filter-tag";
import { CommandList } from "@/components/ui/command";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { swrFetcher } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AdvancedFilterInputProps {
  availableFilters: ColumnFilter[];
  resource: "traces" | "spans";
  placeholder?: string;
  posthogEventName: string;
  additionalSearchParams?: Record<string, string | string[]>;
  className?: string;
}

const AdvancedFilterInput = ({
  availableFilters,
  resource,
  placeholder = "Search...",
  posthogEventName,
  additionalSearchParams = {},
  className,
}: AdvancedFilterInputProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const params = useParams();
  const posthog = usePostHog();

  // State management
  const [filterTags, setFilterTags] = useState<FilterTagState[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTagValueInput, setActiveTagValueInput] = useState("");
  
  const lastSubmittedValueRef = useRef<string>("");
  const debouncedInputValue = useDebounce(inputValue, 400);
  const debouncedTagValueInput = useDebounce(activeTagValueInput, 400);

  // Initialize from URL on mount
  useEffect(() => {
    const rawSearch = searchParams.get("search");
    const filters = searchParams.getAll("filter");
    
    if (rawSearch) {
      setInputValue(rawSearch);
      lastSubmittedValueRef.current = rawSearch;
    }

    // Parse existing filters into tags
    const parsedTags: FilterTagState[] = [];
    filters.forEach((filterStr) => {
      try {
        const filter = JSON.parse(filterStr) as Filter;
        const columnFilter = availableFilters.find((f) => f.key === filter.column);
        if (columnFilter) {
          parsedTags.push({
            id: `${Date.now()}-${Math.random()}`,
            field: filter.column,
            operator: filter.operator,
            value: String(filter.value),
          });
        }
      } catch (e) {
        console.warn("Failed to parse filter:", filterStr, e);
      }
    });
    
    if (parsedTags.length > 0) {
      setFilterTags(parsedTags);
    }
  }, []);

  // Determine what to fetch autocomplete for
  const shouldFetchFieldSuggestions = !activeTagId && inputValue.length > 0;
  const shouldFetchValueSuggestions = activeTagId !== null && activeTagValueInput.length > 0;

  // Fetch value suggestions for active tag
  const activeTag = useMemo(() => 
    filterTags.find((tag) => tag.id === activeTagId),
    [filterTags, activeTagId]
  );

  const valueFetchUrl = useMemo(() => {
    if (!shouldFetchValueSuggestions || !activeTag) return null;
    return `/api/projects/${params.projectId}/${resource}/autocomplete?prefix=${encodeURIComponent(debouncedTagValueInput)}`;
  }, [shouldFetchValueSuggestions, activeTag, params.projectId, resource, debouncedTagValueInput]);

  const { data: valueApiSuggestions = { suggestions: [] }, isLoading: isLoadingValues } = useSWR<{
    suggestions: AutocompleteSuggestion[];
  }>(valueFetchUrl, swrFetcher, {
    fallbackData: { suggestions: [] },
    keepPreviousData: true,
  });

  // Fetch field suggestions (for value autocomplete when typing in main input)
  const fieldFetchUrl = useMemo(() => {
    if (!shouldFetchFieldSuggestions) return null;
    return `/api/projects/${params.projectId}/${resource}/autocomplete?prefix=${encodeURIComponent(debouncedInputValue)}`;
  }, [shouldFetchFieldSuggestions, params.projectId, resource, debouncedInputValue]);

  const { data: fieldApiSuggestions = { suggestions: [] }, isLoading: isLoadingFields } = useSWR<{
    suggestions: AutocompleteSuggestion[];
  }>(fieldFetchUrl, swrFetcher, {
    fallbackData: { suggestions: [] },
    keepPreviousData: true,
  });

  // Generate suggestions based on context
  const suggestions = useMemo((): Suggestion[] => {
    // If we have an active tag, show value suggestions
    if (activeTagId && activeTag) {
      const filtered = valueApiSuggestions.suggestions
        .filter((s) => s.field === activeTag.field)
        .map((s) => s.value);
      
      const unique = Array.from(new Set(filtered));
      
      return unique.map((value) => ({
        type: "value" as const,
        field: activeTag.field,
        value,
      }));
    }

    // Otherwise, show field suggestions based on input
    if (inputValue.length === 0) return [];

    const matchedFields = availableFilters.filter((filter) => {
      const lowerInput = inputValue.toLowerCase();
      return (
        filter.name.toLowerCase().includes(lowerInput) ||
        filter.key.toLowerCase().includes(lowerInput)
      );
    });

    const fieldSuggestions: Suggestion[] = matchedFields.map((filter) => ({
      type: "field" as const,
      value: filter.key,
      displayName: filter.name,
    }));

    // Add raw search option if input doesn't match any field exactly
    const exactMatch = matchedFields.some(
      (f) => f.key.toLowerCase() === inputValue.toLowerCase() || f.name.toLowerCase() === inputValue.toLowerCase()
    );

    if (!exactMatch && inputValue.trim().length > 0) {
      fieldSuggestions.push({
        type: "raw_search" as const,
        value: inputValue.trim(),
      });
    }

    return fieldSuggestions;
  }, [inputValue, activeTagId, activeTag, availableFilters, valueApiSuggestions]);

  // Get value suggestions for active tag (filtered)
  const valueSuggestions = useMemo(() => {
    if (!activeTag) return [];
    
    const filtered = valueApiSuggestions.suggestions
      .filter((s) => s.field === activeTag.field)
      .map((s) => s.value);
    
    return Array.from(new Set(filtered));
  }, [activeTag, valueApiSuggestions]);

  // Handle suggestion selection
  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.type === "field") {
        // Create a new tag
        const columnFilter = availableFilters.find((f) => f.key === suggestion.value);
        if (columnFilter) {
          const newTag: FilterTagState = {
            id: `${Date.now()}-${Math.random()}`,
            field: suggestion.value,
            operator: Operator.Eq,
            value: "",
          };
          setFilterTags((prev) => [...prev, newTag]);
          setInputValue("");
          setActiveTagId(newTag.id);
          setIsOpen(false);
        }
      } else if (suggestion.type === "raw_search") {
        // Submit as raw search
        setInputValue(suggestion.value);
        submit([], suggestion.value);
        setIsOpen(false);
      }
    },
    [availableFilters]
  );

  // Submit function
  const submit = useCallback(
    (tags: FilterTagState[], rawSearch: string = "") => {
      const params = new URLSearchParams(searchParams.toString());
      
      // Clear existing filters
      params.delete("filter");
      params.delete("search");
      params.delete("pageNumber");
      params.set("pageNumber", "0");

      // Add filter tags (include even empty values - they'll be submitted)
      tags.forEach((tag) => {
        const filter: Filter = {
          column: tag.field,
          operator: tag.operator,
          value: tag.value || "", // Include empty string values
        };
        params.append("filter", JSON.stringify(filter));
      });

      // Add raw search if present
      if (rawSearch.trim()) {
        params.set("search", rawSearch.trim());
      }

      // Apply additional search params
      Object.entries(additionalSearchParams).forEach(([key, val]) => {
        params.delete(key);
        if (Array.isArray(val)) {
          val.forEach((v) => params.append(key, v));
        } else {
          params.set(key, val);
        }
      });

      router.push(`${pathName}?${params.toString()}`);
      
      if (isFeatureEnabled(Feature.POSTHOG)) {
        posthog.capture(posthogEventName, {
          searchParams: params.toString(),
        });
      }
    },
    [searchParams, pathName, router, posthogEventName, posthog, additionalSearchParams]
  );

  // Handle main input submit
  const handleSubmit = useCallback(() => {
    if (inputValue.trim()) {
      // Check if it matches a field - if so, don't submit as raw search
      const matchedField = availableFilters.find(
        (f) => f.key.toLowerCase() === inputValue.toLowerCase() || f.name.toLowerCase() === inputValue.toLowerCase()
      );
      
      if (!matchedField) {
        // Submit as raw search
        submit(filterTags, inputValue);
        lastSubmittedValueRef.current = inputValue;
      }
    } else {
      // Just submit the tags
      submit(filterTags, "");
    }
  }, [inputValue, filterTags, availableFilters, submit]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        if (isOpen && suggestions.length > 0) {
          // Let the command list handle it
          return;
        }
        handleSubmit();
        setIsOpen(false);
      } else if (event.key === "Escape") {
        setIsOpen(false);
        setActiveTagId(null);
      }
    },
    [isOpen, suggestions.length, handleSubmit]
  );

  // Tag management callbacks
  const handleTagOperatorChange = useCallback((tagId: string, operator: Operator) => {
    setFilterTags((prev) =>
      prev.map((tag) => (tag.id === tagId ? { ...tag, operator } : tag))
    );
  }, []);

  const handleTagValueChange = useCallback((tagId: string, value: string) => {
    setFilterTags((prev) =>
      prev.map((tag) => (tag.id === tagId ? { ...tag, value } : tag))
    );
  }, []);

  const handleTagRemove = useCallback((tagId: string) => {
    setFilterTags((prev) => prev.filter((tag) => tag.id !== tagId));
    if (activeTagId === tagId) {
      setActiveTagId(null);
    }
  }, [activeTagId]);

  const handleTagValueSubmit = useCallback(
    (tagId: string) => {
      setActiveTagId(null);
      setActiveTagValueInput("");
      // Submit the current state (including tags with empty values)
      const currentTags = filterTags.map((tag) => 
        tag.id === tagId ? { ...tag, value: tag.value || "" } : tag
      );
      submit(currentTags, inputValue);
    },
    [filterTags, inputValue, submit]
  );

  const handleTagActivate = useCallback((tagId: string) => {
    setActiveTagId(tagId);
    const tag = filterTags.find((t) => t.id === tagId);
    if (tag) {
      setActiveTagValueInput(tag.value);
    }
    setIsOpen(false);
  }, [filterTags]);

  const handleValueInputChange = useCallback((tagId: string, value: string) => {
    setActiveTagValueInput(value);
  }, []);

  const handleInputFocus = useCallback(() => {
    setIsOpen(true);
    setActiveTagId(null);
  }, []);

  const handleInputBlur = useCallback(() => {
    // Delay to allow click events to fire
    setTimeout(() => {
      setIsOpen(false);
      // Submit whatever is in the search when blurring
      if (inputValue.trim()) {
        // Check if it matches a field - if so, don't submit as raw search
        const matchedField = availableFilters.find(
          (f) => f.key.toLowerCase() === inputValue.toLowerCase() || f.name.toLowerCase() === inputValue.toLowerCase()
        );
        
        if (!matchedField) {
          // Submit as raw search
          submit(filterTags, inputValue);
          lastSubmittedValueRef.current = inputValue;
        }
      } else if (filterTags.length > 0) {
        // Just submit the tags
        submit(filterTags, "");
      }
    }, 200);
  }, [inputValue, filterTags, availableFilters, submit]);

  return (
    <CommandPrimitive
      loop
      shouldFilter={false}
      className={cn("flex flex-col flex-1 border-b-0 h-fit relative", className)}
    >
      <FilterInputArea
        filterTags={filterTags}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onTagOperatorChange={handleTagOperatorChange}
        onTagValueChange={handleTagValueChange}
        onTagRemove={handleTagRemove}
        onTagValueSubmit={handleTagValueSubmit}
        activeTagId={activeTagId}
        onTagActivate={handleTagActivate}
        availableFilters={availableFilters}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        valueSuggestions={valueSuggestions}
        showValueSuggestions={false} // Handled in FilterTag
        onValueInputChange={handleValueInputChange}
      />

      {isOpen && suggestions.length > 0 && (
        <CommandList className="animate-in fade-in-0 zoom-in-95 absolute top-full z-50 w-full mt-1">
          <FilterSuggestions
            suggestions={suggestions}
            onSelect={handleSelectSuggestion}
            isLoading={isLoadingFields || isLoadingValues}
            inputValue={inputValue}
          />
        </CommandList>
      )}
    </CommandPrimitive>
  );
};

export default memo(AdvancedFilterInput);

