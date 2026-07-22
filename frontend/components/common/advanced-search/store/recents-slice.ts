import { FilterSchema } from "@/lib/actions/common/filter-schemas";

import type { RecentSearch, RecentsSlice, SliceCreator } from "./types";

export type { RecentSearch, RecentsSlice } from "./types";

const MAX_RECENT_SEARCHES = 5;

function areSearchesEqual(a: RecentSearch, b: RecentSearch): boolean {
  if (a.search !== b.search) return false;
  if (a.filters.length !== b.filters.length) return false;
  return JSON.stringify(a.filters) === JSON.stringify(b.filters);
}

export const createRecentsSlice: SliceCreator<RecentsSlice> = (set, get, { storageKey }) => ({
  recentSearches: [],

  addRecentSearch: (filters, search) => {
    if (!storageKey) return;

    const validFilters = filters.filter((f) => FilterSchema.safeParse(f).success);
    if (validFilters.length === 0 && !search.trim()) return;

    const entry: RecentSearch = {
      filters: validFilters,
      search: search.trim(),
      timestamp: Date.now(),
    };

    const { recentSearches } = get();
    const deduplicated = recentSearches.filter((s) => !areSearchesEqual(s, entry));
    set({ recentSearches: [entry, ...deduplicated].slice(0, MAX_RECENT_SEARCHES) });
  },
});
