"use server";

import { z } from "zod/v4";

import { AUTOCOMPLETE_CACHE_KEY, cache } from "@/lib/cache";

const AUTOCOMPLETE_MAX_RESULTS_PER_FIELD = 7;

const GetAutocompleteSuggestionsSchema = z.object({
  projectId: z.string(),
  resource: z.enum(["traces", "spans"]),
  prefix: z.string().default(""),
});

export type AutocompleteSuggestion = {
  field: string;
  value: string;
};

function autocompleteRange(prefix: string): [string, string] {
  const min = `[${prefix}`;
  const max = `[${prefix}\u00ff`;
  return [min, max];
}

export async function getAutocompleteSuggestions(
  input: z.infer<typeof GetAutocompleteSuggestionsSchema>
): Promise<AutocompleteSuggestion[]> {
  const { projectId, resource, prefix } = GetAutocompleteSuggestionsSchema.parse(input);

  try {
    if (!prefix) {
      const [names, models, tags] = await Promise.all([
        cache.zrange(AUTOCOMPLETE_CACHE_KEY(resource, projectId, "names"), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1),
        cache.zrange(AUTOCOMPLETE_CACHE_KEY(resource, projectId, "models"), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1),
        cache.zrange(AUTOCOMPLETE_CACHE_KEY(resource, projectId, "tags"), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1),
      ]);

      return [
        ...names.map((value) => ({ field: "name", value })),
        ...models.map((value) => ({ field: "model", value })),
        ...tags.map((value) => ({ field: "tag", value })),
      ];
    }

    const [min, max] = autocompleteRange(prefix);

    const [names, models, tags] = await Promise.all([
      cache.zrangebylex(
        AUTOCOMPLETE_CACHE_KEY(resource, projectId, "names"),
        min,
        max,
        AUTOCOMPLETE_MAX_RESULTS_PER_FIELD
      ),
      cache.zrangebylex(
        AUTOCOMPLETE_CACHE_KEY(resource, projectId, "models"),
        min,
        max,
        AUTOCOMPLETE_MAX_RESULTS_PER_FIELD
      ),
      cache.zrangebylex(
        AUTOCOMPLETE_CACHE_KEY(resource, projectId, "tags"),
        min,
        max,
        AUTOCOMPLETE_MAX_RESULTS_PER_FIELD
      ),
    ]);

    return [
      ...names.map((value) => ({ field: "name", value })),
      ...models.map((value) => ({ field: "model", value })),
      ...tags.map((value) => ({ field: "tag", value })),
    ];
  } catch (error) {
    console.error("Failed to get autocomplete suggestions:", error);
    return [];
  }
}
