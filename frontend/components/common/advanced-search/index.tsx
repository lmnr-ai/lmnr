"use client";

import { isEqual } from "lodash";
import { useParams } from "next/navigation";
import { memo, useEffect, useRef } from "react";
import useSWR from "swr";

import { type AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { type Filter } from "@/lib/actions/common/filters";
import { swrFetcher } from "@/lib/utils";

import FilterSearchInput from "./components/search-input";
import { AdvancedSearchStoreProvider, useAdvancedSearchContext } from "./store";
import { type ColumnFilter } from "./types";

export interface AdvancedSearchValue {
  filters: Filter[];
  search: string;
}

interface AdvancedSearchInnerProps {
  resource?: "traces" | "spans" | "sessions";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  value: AdvancedSearchValue;
  options?: {
    suggestions?: Map<string, string[]>;
    disableHotKey?: boolean;
  };
}

const AdvancedSearchInner = ({
  resource,
  placeholder = "Search...",
  className,
  disabled,
  value,
  options: { suggestions, disableHotKey } = { disableHotKey: false },
}: AdvancedSearchInnerProps) => {
  const params = useParams();
  const projectId = params.projectId as string;

  const setAutocompleteData = useAdvancedSearchContext((state) => state.setAutocompleteData);
  const reflowFromValue = useAdvancedSearchContext((state) => state.reflowFromValue);

  // Reflow editor state when controlled `value` changes from the outside
  // (parent's view switch / discard / undo). We diff against the last
  // committed snapshot via lodash equality inside `reflowFromValue` so
  // round-tripping our own commits doesn't double-apply.
  const lastReflowedRef = useRef<AdvancedSearchValue>(value);
  useEffect(() => {
    // Reference-cheap shortcut.
    if (lastReflowedRef.current === value) return;
    // Structural compare so an `onChange` that returns a new object with
    // identical contents doesn't churn editor state.
    if (lastReflowedRef.current.search === value.search && isEqual(lastReflowedRef.current.filters, value.filters)) {
      lastReflowedRef.current = value;
      return;
    }
    lastReflowedRef.current = value;
    reflowFromValue(value);
  }, [value, reflowFromValue]);

  const autocompleteResource = resource === "traces" || resource === "spans" ? resource : null;
  useSWR<{ suggestions: AutocompleteSuggestion[] }>(
    suggestions || !autocompleteResource ? null : `/api/projects/${projectId}/${autocompleteResource}/autocomplete`,
    swrFetcher,
    {
      onSuccess: (data) => {
        const cache = new Map<string, string[]>();
        data.suggestions.forEach((suggestion) => {
          const existing = cache.get(suggestion.field) || [];
          if (!existing.includes(suggestion.value)) {
            existing.push(suggestion.value);
          }
          cache.set(suggestion.field, existing);
        });
        setAutocompleteData(cache);
      },
      fallbackData: { suggestions: [] },
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  useEffect(() => {
    if (suggestions) {
      setAutocompleteData(suggestions);
    }
  }, [suggestions, setAutocompleteData]);

  return (
    <FilterSearchInput
      disableHotKey={disableHotKey}
      placeholder={placeholder}
      className={className}
      resource={resource}
      disabled={disabled}
    />
  );
};

AdvancedSearchInner.displayName = "AdvancedSearchInner";

interface AdvancedSearchProps {
  filters: ColumnFilter[];
  resource?: "traces" | "spans" | "sessions";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  value: AdvancedSearchValue;
  onChange: (next: AdvancedSearchValue) => void;
  storageKey?: string;
  options?: {
    // If provided, autocomplete won't fetch suggestions.
    suggestions?: Map<string, string[]>;
    disableHotKey?: boolean;
  };
}

const AdvancedSearch = ({
  filters,
  resource,
  placeholder,
  className,
  disabled,
  value,
  onChange,
  storageKey,
  options: { suggestions, disableHotKey } = { disableHotKey: false },
}: AdvancedSearchProps) => (
  <AdvancedSearchStoreProvider
    filters={filters}
    initialFilters={value.filters}
    initialSearch={value.search}
    onChange={onChange}
    suggestions={suggestions}
    storageKey={storageKey}
    resource={resource}
  >
    <AdvancedSearchInner
      resource={resource}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      value={value}
      options={{
        suggestions,
        disableHotKey,
      }}
    />
  </AdvancedSearchStoreProvider>
);

AdvancedSearch.displayName = "AdvancedSearch";

export default memo(AdvancedSearch);
