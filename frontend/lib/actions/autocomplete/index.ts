import { z } from "zod/v4";

import { getTopSuggestions, isAutocompleteCacheExists, searchSuggestions } from "@/lib/actions/autocomplete/cache.ts";
import { FIELD_TO_CACHE_KEY } from "@/lib/actions/autocomplete/fields";
import { executeQuery } from "@/lib/actions/sql";

const GetAutocompleteSuggestionsSchema = z.object({
  projectId: z.string(),
  entity: z.enum(["traces", "spans"]),
  prefix: z.string().trim().default(""),
  field: z.string().optional(),
});

export type AutocompleteSuggestion = {
  field: string;
  value: string;
};

const getSuggestions = async (
  resource: string,
  projectId: string,
  field: string,
  prefix: string = ""
): Promise<string[]> => {
  const exists = await isAutocompleteCacheExists("spans", projectId, "names");

  if (exists) {
    return prefix
      ? await searchSuggestions(resource, projectId, field, prefix)
      : await getTopSuggestions(resource, projectId, field);
  }

  const { queries, parameters } = getAutocompleteQueries(field, prefix);
  const results = await Promise.all(
    queries.map((query) => executeQuery<{ value: string }>({ query, projectId, parameters }))
  );

  return results.flatMap((result) => result.map((r) => r.value));
};

const getSpansSuggestions = async (projectId: string, prefix: string): Promise<AutocompleteSuggestion[]> => {
  const [names, tags, models] = await Promise.all([
    getSuggestions("spans", projectId, "names", prefix),
    getSuggestions("spans", projectId, "tags", prefix),
    getSuggestions("spans", projectId, "models", prefix),
  ]);

  return [
    ...names.map((value) => ({ field: "name", value })),
    ...models.map((value) => ({ field: "model", value })),
    ...tags.map((value) => ({ field: "tags", value })),
  ];
};

const getTracesSuggestions = async (projectId: string, prefix: string): Promise<AutocompleteSuggestion[]> => {
  const [names, tags] = await Promise.all([
    getSuggestions("spans", projectId, "top_span_names", prefix),
    getSuggestions("spans", projectId, "tags", prefix),
  ]);

  return [
    ...names.map((value) => ({ field: "top_span_name", value })),
    ...tags.map((value) => ({ field: "tags", value })),
  ];
};

const getFieldSuggestions = async (
  entity: "traces" | "spans",
  projectId: string,
  field: string,
  prefix: string
): Promise<AutocompleteSuggestion[]> => {
  const cacheKey = FIELD_TO_CACHE_KEY[entity]?.[field];
  if (!cacheKey) {
    return [];
  }

  const values = await getSuggestions("spans", projectId, cacheKey, prefix);
  return values.map((value) => ({ field, value }));
};

export async function getAutocompleteSuggestions(
  input: z.infer<typeof GetAutocompleteSuggestionsSchema>
): Promise<AutocompleteSuggestion[]> {
  const { projectId, entity, prefix, field } = GetAutocompleteSuggestionsSchema.parse(input);

  // If a specific field is requested, only fetch for that field
  if (field) {
    return await getFieldSuggestions(entity, projectId, field, prefix);
  }

  // Otherwise, fetch all suggestions (legacy behavior)
  if (entity === "spans") {
    return await getSpansSuggestions(projectId, prefix);
  } else {
    return await getTracesSuggestions(projectId, prefix);
  }
}

const getAutocompleteQueries = (
  field: string,
  prefix: string = ""
): { queries: string[]; parameters?: Record<string, string> } => {
  const hasPrefix = prefix.length > 0;
  const prefixFilter = hasPrefix ? `ILIKE {prefix:String}` : `!= ''`;
  const parameters = hasPrefix ? { prefix: `${prefix}%` } : undefined;

  switch (field) {
    case "names":
      return {
        queries: [
          `SELECT DISTINCT name as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND name ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
        ],
        parameters,
      };
    case "top_span_names":
      return {
        queries: [
          `SELECT DISTINCT name as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND name ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
        ],
        parameters,
      };
    case "models":
      return {
        queries: [
          `SELECT DISTINCT request_model as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND request_model ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
          `SELECT DISTINCT response_model as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND response_model ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
        ],
        parameters,
      };
    case "tags":
      return {
        queries: [
          `SELECT DISTINCT name as value FROM tags WHERE created_at >= now() - INTERVAL 7 days AND created_at < now() AND name ${prefixFilter} ORDER BY created_at DESC LIMIT 5`,
        ],
        parameters,
      };
    default:
      return { queries: [] };
  }
};
