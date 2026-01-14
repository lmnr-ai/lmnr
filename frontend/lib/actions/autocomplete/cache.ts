import { AUTOCOMPLETE_CACHE_KEY, cache } from "@/lib/cache";

const AUTOCOMPLETE_MAX_RESULTS_PER_FIELD = 512;

export const getTopSuggestions = async (resource: string, projectId: string, field: string): Promise<string[]> =>
  cache.zrange(AUTOCOMPLETE_CACHE_KEY(resource, projectId, field), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1);

export const isAutocompleteCacheExists = async (resource: string, projectId: string, field: string): Promise<boolean> =>
  cache.exists(AUTOCOMPLETE_CACHE_KEY(resource, projectId, field));
