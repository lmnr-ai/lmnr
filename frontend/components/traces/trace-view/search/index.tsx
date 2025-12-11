import { uniqBy } from "lodash";
import { memo, useCallback, useMemo, useRef } from "react";

import BaseAutocomplete from "@/components/common/autocomplete/base-autocomplete.tsx";
import { extractSpanSuggestions, STATIC_SPAN_SUGGESTIONS } from "@/components/traces/trace-view/search/utils.ts";
import { TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Filter } from "@/lib/actions/common/filters.ts";
import { Operator } from "@/lib/actions/common/operators.ts";

interface SearchTraceSpansInputProps {
  spans: TraceViewSpan[];
  submit: (search: string, filters: Filter[]) => Promise<void>;
  filters: Filter[];
  onAddFilter: (filter: Filter) => void;
}

const MAX_SUGGESTIONS = 15;

const SearchTraceSpansInput = ({ spans, submit, filters, onAddFilter }: SearchTraceSpansInputProps) => {
  const { search, setSearch } = useTraceViewStoreContext((state) => ({
    search: state.search,
    setSearch: state.setSearch,
  }));

  const lastSubmittedValueRef = useRef<string>(search);

  const dynamicSuggestions = useMemo(() => extractSpanSuggestions(spans), [spans]);

  const filteredSuggestions = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    const allSuggestions = [...dynamicSuggestions, ...STATIC_SPAN_SUGGESTIONS];

    const filtered = searchTerm
      ? allSuggestions.filter(
        (suggestion) =>
          suggestion.value.toLowerCase().includes(searchTerm) || suggestion.field.toLowerCase().includes(searchTerm)
      )
      : allSuggestions;

    const unique = uniqBy(filtered, (s) => `${s.field}:${s.value}`);
    const results = unique.slice(0, MAX_SUGGESTIONS - 1);

    if (searchTerm) {
      return [...results, { field: "search", value: search.trim() }];
    }

    return unique.slice(0, MAX_SUGGESTIONS);
  }, [search, dynamicSuggestions]);

  const handleSubmit = useCallback(async () => {
    if (search !== lastSubmittedValueRef.current) {
      lastSubmittedValueRef.current = search;
      await submit(search, filters);
    }
  }, [search, submit, filters]);

  const handleSelect = useCallback(
    async (suggestion: AutocompleteSuggestion) => {
      if (suggestion.field === "search") {
        lastSubmittedValueRef.current = suggestion.value;
        setSearch(suggestion.value);
        await submit(suggestion.value, filters);
      } else {
        lastSubmittedValueRef.current = "";
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
        inputValue={search}
        onInputChange={setSearch}
        onSelect={handleSelect}
        onSubmit={handleSubmit}
        placeholder="Search in spans..."
        wrapperClassName="px-2 py-0.5 rounded-none border-0 border-b ring-0 bg-background not-focus-within:bg-background focus-within:ring-0"
        listClassName="bg-background mt-0 w-[calc(100%_-_16px)] left-2 rounded-t-none border-t-0"
      />
    </div>
  );
};

export default memo(SearchTraceSpansInput);
