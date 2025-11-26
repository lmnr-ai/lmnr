import { AUTOCOMPLETE_CACHE_KEY, cache } from "@/lib/cache";

const AUTOCOMPLETE_MAX_RESULTS_PER_FIELD = 7;

export const getTopSuggestions = async (resource: string, projectId: string, field: string): Promise<string[]> =>
  cache.zrange(AUTOCOMPLETE_CACHE_KEY(resource, projectId, field), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1);

export const isAutocompleteCacheExists = async (resource: string, projectId: string, field: string): Promise<boolean> =>
  cache.exists(AUTOCOMPLETE_CACHE_KEY(resource, projectId, field));

export const searchSuggestions = async (
  resource: string,
  projectId: string,
  field: string,
  prefix: string
): Promise<string[]> =>
  cache.zrangebylex(
    AUTOCOMPLETE_CACHE_KEY(resource, projectId, field),
    `[${prefix}`,
    `[${prefix}\u00ff`,
    AUTOCOMPLETE_MAX_RESULTS_PER_FIELD
  );
