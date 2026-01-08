"use client";

import { useParams } from "next/navigation";
import { memo, useEffect } from "react";
import useSWR from "swr";

import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Filter } from "@/lib/actions/common/filters";
import { swrFetcher } from "@/lib/utils";

import { AutocompleteProvider, FilterSearchProvider, StatefulFilterProvider, useAutocompleteData } from "../context";
import FilterSearchInput from "../filters/filter-search-input";
import { ColumnFilter } from "../types";

interface StatefulProviderProps {
  filters: ColumnFilter[];
  initialFilters?: Filter[];
  resource?: "traces" | "spans";
  placeholder?: string;
  className?: string;
  onSubmit?: (filters: Filter[], search: string) => void;
}

const StatefulProviderInner = ({
  filters,
  initialFilters = [],
  resource = "traces",
  placeholder = "Search...",
  className,
  onSubmit,
}: StatefulProviderProps) => {
  const params = useParams();
  const projectId = params.projectId as string;
  const { setAutocompleteData, setIsAutocompleteLoading } = useAutocompleteData();

  // Fetch all autocomplete data on mount
  const { data, isLoading } = useSWR<{ suggestions: AutocompleteSuggestion[] }>(
    projectId ? `/api/projects/${projectId}/${resource}/autocomplete` : null,
    swrFetcher,
    {
      fallbackData: { suggestions: [] },
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  // Update autocomplete data in context when loaded
  useEffect(() => {
    if (data?.suggestions) {
      const cache = new Map<string, string[]>();
      data.suggestions.forEach((suggestion) => {
        const existing = cache.get(suggestion.field) || [];
        if (!existing.includes(suggestion.value)) {
          existing.push(suggestion.value);
        }
        cache.set(suggestion.field, existing);
      });
      setAutocompleteData(cache);
    }
  }, [data, setAutocompleteData]);

  useEffect(() => {
    setIsAutocompleteLoading(isLoading);
  }, [isLoading, setIsAutocompleteLoading]);

  return (
    <StatefulFilterProvider initialFilters={initialFilters}>
      <FilterSearchProvider filters={filters} mode="stateful" onSubmit={onSubmit}>
        <FilterSearchInput placeholder={placeholder} className={className} resource={resource} />
      </FilterSearchProvider>
    </StatefulFilterProvider>
  );
};

const StatefulProvider = (props: StatefulProviderProps) => (
  <AutocompleteProvider>
    <StatefulProviderInner {...props} />
  </AutocompleteProvider>
);

StatefulProvider.displayName = "StatefulProvider";

export default memo(StatefulProvider);
