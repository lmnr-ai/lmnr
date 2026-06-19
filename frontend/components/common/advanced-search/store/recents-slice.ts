import { type Filter, FilterSchema } from "@/lib/actions/common/filters";

import type { SliceCreator } from "./types";

export interface RecentSearch {
  filters: Filter[];
  search: string;
  timestamp: number;
}

const MAX_RECENT_SEARCHES = 5;

function areSearchesEqual(a: RecentSearch, b: RecentSearch): boolean {
  if (a.search !== b.search) return false;
  if (a.filters.length !== b.filters.length) return false;
  return JSON.stringify(a.filters) === JSON.stringify(b.filters);
}

export interface RecentsSlice {
  recentSearches: RecentSearch[];
  addRecentSearch: (filters: Filter[], search: string) => void;
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
