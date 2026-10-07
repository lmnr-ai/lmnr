"use client";

import { useCallback } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import { filterColumns } from "@/components/traces/trace-view/utils";
import { type Filter } from "@/lib/actions/common/filters";

import { useSessionViewStore } from "../store";

const EMPTY_SEARCH_VALUE: { filters: Filter[]; search: string } = { filters: [], search: "" };
const SEARCH_OPTIONS = { suggestions: new Map(), disableHotKey: true };

/**
 * Regular-session-only search input. Reads the concrete store (searchSessionSpans
 * / clearSearch) so it MUST NOT mount under the debugger provider — it's passed
 * to SessionPanel as the `searchSlot` only from the regular SessionViewContent.
 */
export default function RegularSearchSlot() {
  const searchSessionSpans = useSessionViewStore((s) => s.searchSessionSpans);
  const clearSearch = useSessionViewStore((s) => s.clearSearch);
  const isTracesLoading = useSessionViewStore((s) => s.isTracesLoading);

  const handleSearch = useCallback(
    (filters: Filter[], search: string) => {
      if (!search && filters.length === 0) {
        clearSearch();
      } else {
        searchSessionSpans(filters, search);
      }
    },
    [searchSessionSpans, clearSearch]
  );

  return (
    // TODO(session-view): add autocomplete suggestions from loaded/matched spans
    <AdvancedSearch
      filters={filterColumns}
      resource="spans"
      value={EMPTY_SEARCH_VALUE}
      onChange={({ filters, search }) => handleSearch(filters, search)}
      placeholder="Search text, name, id, tags..."
      className="w-full"
      disabled={isTracesLoading}
      options={SEARCH_OPTIONS}
    />
  );
}
