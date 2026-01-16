import { memo, useCallback, useMemo, useRef, useState } from "react";

import BaseAutocomplete from "@/components/common/autocomplete/base-autocomplete.tsx";
import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store.tsx";
import {
  extractSpanSuggestions,
  STATIC_SPAN_SUGGESTIONS,
} from "@/components/rollout-sessions/rollout-session-view/search/utils.ts";
import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { type AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { type Filter } from "@/lib/actions/common/filters.ts";
import { Operator } from "@/lib/actions/common/operators.ts";

interface SearchRolloutSessionSpansInputProps {
  spans: TraceViewSpan[];
  submit: (search: string, filters: Filter[]) => Promise<void>;
  filters: Filter[];
  onAddFilter: (filter: Filter) => void;
}

const MAX_SUGGESTIONS = 15;

const SearchRolloutSessionSpansInput = ({
  spans,
  submit,
  filters,
  onAddFilter,
}: SearchRolloutSessionSpansInputProps) => {
  const { storeSearch, setSearch } = useRolloutSessionStoreContext((state) => ({
    storeSearch: state.search,
    setSearch: state.setSearch,
  }));

  const [localSearch, setLocalSearch] = useState(storeSearch);
  const lastSubmittedValueRef = useRef<string>(storeSearch);

  const dynamicSuggestions = useMemo(() => extractSpanSuggestions(spans), [spans]);

  const filteredSuggestions = useMemo(() => {
    const searchTerm = localSearch.trim().toLowerCase();
    const MAX_PER_CATEGORY = 3;
    const byCategory = new Map<string, AutocompleteSuggestion[]>();

    const allSuggestions = [...dynamicSuggestions, ...STATIC_SPAN_SUGGESTIONS];

    for (const suggestion of allSuggestions) {
      const matches =
        !searchTerm ||
        suggestion.value.toLowerCase().includes(searchTerm) ||
        suggestion.field.toLowerCase().includes(searchTerm);

      if (!matches) continue;

      const items = byCategory.get(suggestion.field);
      if (!items) {
        byCategory.set(suggestion.field, [suggestion]);
      } else if (items.length < MAX_PER_CATEGORY) {
        items.push(suggestion);
      }
    }

    const results = Array.from(byCategory.values()).flat();

    if (searchTerm) {
      results.push({ field: "search", value: localSearch.trim() });
    }

    return results.slice(0, MAX_SUGGESTIONS);
  }, [localSearch, dynamicSuggestions]);

  const handleSubmit = useCallback(async () => {
    if (localSearch !== lastSubmittedValueRef.current) {
      lastSubmittedValueRef.current = localSearch;
      setSearch(localSearch); // Only update store on submit
      await submit(localSearch, filters);
    }
  }, [localSearch, submit, filters, setSearch]);

  const handleSelect = useCallback(
    async (suggestion: AutocompleteSuggestion) => {
      if (suggestion.field === "search") {
        lastSubmittedValueRef.current = suggestion.value;
        setLocalSearch(suggestion.value);
        setSearch(suggestion.value);
        await submit(suggestion.value, filters);
      } else {
        lastSubmittedValueRef.current = "";
        setLocalSearch("");
        setSearch("");
        const newFilter: Filter = {
          column: suggestion.field,
          operator: Operator.Eq,
          value: suggestion.value,
        };
        onAddFilter(newFilter);
      }
    },
    [submit, filters, onAddFilter, setSearch]
  );

  return (
    <div className="flex flex-col sticky bg-background z-40 box-border">
      <BaseAutocomplete
        suggestions={filteredSuggestions}
        inputValue={localSearch}
        onInputChange={setLocalSearch}
        onSelect={handleSelect}
        onSubmit={handleSubmit}
        placeholder="Search in spans..."
        wrapperClassName="px-2 py-0.5 rounded-none border-0 border-b ring-0 bg-background not-focus-within:bg-background focus-within:ring-0"
        listClassName="bg-background mt-0 w-[calc(100%_-_16px)] left-2 rounded-t-none border-t-0"
      />
    </div>
  );
};

export default memo(SearchRolloutSessionSpansInput);
