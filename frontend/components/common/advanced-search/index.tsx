"use client";

import { differenceWith, intersectionWith } from "lodash";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useEffect, useMemo } from "react";
import useSWR from "swr";

import { type AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { type Filter, FilterSchemaRelaxed } from "@/lib/actions/common/filters";
import { swrFetcher } from "@/lib/utils";

import FilterSearchInput from "./components/search-input";
import { AdvancedSearchStoreProvider, useAdvancedSearchContext } from "./store";
import {
  type AdvancedSearchMode,
  type ColumnFilter,
  createFilterFromTag,
  createTagFromFilter,
  type FilterTag,
} from "./types";

interface AdvancedSearchInnerProps {
  filters: ColumnFilter[];
  resource: "traces" | "spans";
  placeholder?: string;
  className?: string;
  options?: {
    suggestions?: Map<string, string[]>;
    disableHotKey?: boolean;
  };
}

const AdvancedSearchInner = ({
  resource,
  placeholder = "Search...",
  className,
  filters,
  options: { suggestions, disableHotKey } = { disableHotKey: false },
}: AdvancedSearchInnerProps) => {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;

  const mode = useAdvancedSearchContext((state) => state.mode);
  const setAutocompleteData = useAdvancedSearchContext((state) => state.setAutocompleteData);

  const { setTags, updateLastSubmitted } = useAdvancedSearchContext((state) => ({
    setTags: state.setTags,
    updateLastSubmitted: state.updateLastSubmitted,
  }));

  const tags = useAdvancedSearchContext((state) => state.tags);

  const urlTags = useMemo(() => {
    if (mode === "state") return [];

    const filterParams = searchParams.getAll("filter");

    return filterParams.flatMap((f) => {
      try {
        const parsed = JSON.parse(f);
        const result = FilterSchemaRelaxed.safeParse(parsed);

        if (!result.success) {
          return [];
        }

        const filter = result.data;
        const columnFilter = filters.find((col) => col.key === filter.column);

        if (columnFilter) {
          return [createTagFromFilter(filter)];
        }
        return [];
      } catch {
        return [];
      }
    });
  }, [searchParams, filters, mode]);

  useEffect(() => {
    if (mode === "state") return;

    const tagComparator = (tagA: FilterTag, tagB: FilterTag) =>
      tagA.field === tagB.field && tagA.operator === tagB.operator && tagA.value === tagB.value;

    const commonTags = intersectionWith(tags, urlTags, tagComparator);

    const newTags = differenceWith(urlTags, tags, tagComparator);

    const removedTags = differenceWith(tags, urlTags, tagComparator);

    const tagsChanged = newTags.length > 0 || removedTags.length > 0;

    if (tagsChanged) {
      const mergedTags = [...commonTags, ...newTags];
      setTags(mergedTags);
      const filterObjects = mergedTags.map(createFilterFromTag);
      const currentSearch = searchParams.get("search") ?? "";
      updateLastSubmitted(filterObjects, currentSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTags, setTags, updateLastSubmitted, mode]);

  useSWR<{ suggestions: AutocompleteSuggestion[] }>(
    suggestions ? null : `/api/projects/${projectId}/${resource}/autocomplete`,
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
  }, [suggestions]);

  return (
    <FilterSearchInput
      disableHotKey={disableHotKey}
      placeholder={placeholder}
      className={className}
      resource={resource}
    />
  );
};

AdvancedSearchInner.displayName = "AdvancedSearchInner";

interface AdvancedSearchProps {
  filters: ColumnFilter[];
  resource: "traces" | "spans";
  placeholder?: string;
  className?: string;
  mode?: AdvancedSearchMode;
  value?: { filters: Filter[]; search: string };
  onSubmit?: (filters: Filter[], search: string) => void;
  options?: {
    // If provided autocomplete won't fetch suggestions
    suggestions?: Map<string, string[]>;
    disableHotKey?: boolean;
  };
}

const AdvancedSearch = ({
  filters,
  resource,
  placeholder,
  className,
  mode = "url",
  value,
  onSubmit,
  options: { suggestions, disableHotKey } = { disableHotKey: false },
}: AdvancedSearchProps) => (
  <AdvancedSearchStoreProvider
    filters={filters}
    mode={mode}
    initialFilters={value?.filters}
    initialSearch={value?.search}
    onSubmit={onSubmit}
    suggestions={suggestions}
  >
    <AdvancedSearchInner
      filters={filters}
      resource={resource}
      placeholder={placeholder}
      className={className}
      options={{
        suggestions,
        disableHotKey,
      }}
    />
  </AdvancedSearchStoreProvider>
);

AdvancedSearch.displayName = "AdvancedSearch";

export default memo(AdvancedSearch);
