"use client";

import { useParams } from "next/navigation";
import { memo, useEffect } from "react";
import useSWR from "swr";

import { type AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { type Filter } from "@/lib/actions/common/filters";
import { swrFetcher } from "@/lib/utils";

import FilterSearchInput from "./components/search-input";
import { AdvancedSearchStoreProvider, useAdvancedSearchContext } from "./store";
import { type AdvancedSearchResource, type ColumnFilter } from "./types";

export interface AdvancedSearchValue {
  filters: Filter[];
  search: string;
}

interface AdvancedSearchInnerProps {
  resource?: AdvancedSearchResource;
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

  // Reflow editor state when controlled `value` changes from the outside.
  // `reflowFromValue` early-outs when content matches what we last emitted,
  // so round-trips of our own commits are a no-op.
  useEffect(() => {
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
  resource?: AdvancedSearchResource;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  value: AdvancedSearchValue;
  onChange: (next: AdvancedSearchValue) => void;
  storageKey?: string;
  // Set false for consumers that build filters only and have no full-text
  // backend (e.g. signal filters) — the typed query then just narrows the
  // suggestion list instead of committing as `search`.
  allowFreeTextSearch?: boolean;
  // When set, a bare UUID typed into the search box pre-selects an
  // exact-match filter suggestion on this column, so Enter applies it
  // without an extra arrow-down. Explicitly picking full-text search (or
  // blurring without selecting anything) still searches the raw value.
  uuidFilterColumn?: string;
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
  allowFreeTextSearch = true,
  uuidFilterColumn,
  options: { suggestions, disableHotKey } = { disableHotKey: false },
}: AdvancedSearchProps) => (
  <AdvancedSearchStoreProvider
    filters={filters}
    initialFilters={value.filters}
    initialSearch={value.search}
    onChange={onChange}
    allowFreeTextSearch={allowFreeTextSearch}
    suggestions={suggestions}
    storageKey={storageKey}
    resource={resource}
    uuidFilterColumn={uuidFilterColumn}
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
