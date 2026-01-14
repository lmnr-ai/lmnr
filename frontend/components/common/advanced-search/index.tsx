"use client";

import { useParams, useSearchParams } from "next/navigation";
import { memo, useMemo } from "react";
import useSWR from "swr";

import { type AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { type Filter, FilterSchema } from "@/lib/actions/common/filters";
import { swrFetcher } from "@/lib/utils";

import FilterSearchInput from "./components/search-input";
import { AdvancedSearchStoreProvider, useAdvancedSearchContext } from "./store";
import { type ColumnFilter, createTagFromFilter, type FilterTag } from "./types";

interface AdvancedSearchProps {
  filters: ColumnFilter[];
  resource: "traces" | "spans";
  placeholder?: string;
  className?: string;
  onSubmit?: (filters: Filter[], search: string) => void;
}

const AdvancedSearchContent = ({
  resource,
  placeholder = "Search...",
  className,
}: {
  resource: "traces" | "spans";
  placeholder?: string;
  className?: string;
}) => {
  const params = useParams();
  const projectId = params.projectId as string;
  const setAutocompleteData = useAdvancedSearchContext((state) => state.setAutocompleteData);

  useSWR<{ suggestions: AutocompleteSuggestion[] }>(`/api/projects/${projectId}/${resource}/autocomplete`, swrFetcher, {
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
  });

  return <FilterSearchInput placeholder={placeholder} className={className} resource={resource} />;
};

const AdvancedSearch = ({ filters, resource, placeholder, className, onSubmit }: AdvancedSearchProps) => {
  const searchParams = useSearchParams();

  const { tags, search } = useMemo(() => {
    const search = searchParams.get("search") ?? "";
    const filterParams = searchParams.getAll("filter");
    const tags: FilterTag[] = filterParams.flatMap((f) => {
      try {
        const parsed = JSON.parse(f);
        const result = FilterSchema.safeParse(parsed);

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

    return {
      tags,
      search,
    };
  }, [searchParams, filters]);

  return (
    <AdvancedSearchStoreProvider filters={filters} tags={tags} search={search} onSubmit={onSubmit}>
      <AdvancedSearchContent resource={resource} placeholder={placeholder} className={className} />
    </AdvancedSearchStoreProvider>
  );
};

AdvancedSearch.displayName = "AdvancedSearch";

export default memo(AdvancedSearch);
