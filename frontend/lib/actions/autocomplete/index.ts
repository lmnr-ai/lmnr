import { z } from "zod/v4";

import { getTopSuggestions, isAutocompleteCacheExists, searchSuggestions } from "@/lib/actions/autocomplete/cache.ts";
import { executeQuery } from "@/lib/actions/sql";

const GetAutocompleteSuggestionsSchema = z.object({
  projectId: z.string(),
  entity: z.enum(["traces", "spans"]),
  prefix: z.string().trim().default(""),
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
  const exists = await isAutocompleteCacheExists(resource, projectId, field);

  if (exists) {
    return prefix
      ? await searchSuggestions(resource, projectId, field, prefix)
      : await getTopSuggestions(resource, projectId, field);
  }

  const queries = getAutocompleteQueries(field, prefix);
  const results = await Promise.all(queries.map((query) => executeQuery<{ value: string }>({ query, projectId })));

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
    ...tags.map((value) => ({ field: "tag", value })),
  ];
};

const getTracesSuggestions = async (projectId: string, prefix: string): Promise<AutocompleteSuggestion[]> => {
  const [names, tags] = await Promise.all([
    getSuggestions("spans", projectId, "top_span_names", prefix),
    getSuggestions("spans", projectId, "tags", prefix),
  ]);

  return [
    ...names.map((value) => ({ field: "top_span_name", value })),
    ...tags.map((value) => ({ field: "tag", value })),
  ];
};

export async function getAutocompleteSuggestions(
  input: z.infer<typeof GetAutocompleteSuggestionsSchema>
): Promise<AutocompleteSuggestion[]> {
  const { projectId, entity, prefix } = GetAutocompleteSuggestionsSchema.parse(input);

  if (entity === "spans") {
    return await getSpansSuggestions(projectId, prefix);
  } else {
    return await getTracesSuggestions(projectId, prefix);
  }
}

const getAutocompleteQueries = (field: string, prefix: string = ""): string[] => {
  const prefixFilter = prefix ? `ILIKE '${prefix}%'` : `!= ''`;

  switch (field) {
    case "names":
      return [
        `SELECT DISTINCT name as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND name ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
      ];
    case "top_span_names":
      return [
        `SELECT DISTINCT name as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND name ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
      ];
    case "models":
      return [
        `SELECT DISTINCT request_model as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND request_model ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
        `SELECT DISTINCT response_model as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND response_model ${prefixFilter} ORDER BY start_time DESC LIMIT 5`,
      ];
    case "tags":
      return [
        `SELECT DISTINCT name as value FROM tags WHERE created_at >= now() - INTERVAL 7 days AND created_at < now() AND name ${prefixFilter} ORDER BY created_at DESC LIMIT 5`,
      ];
    default:
      return [];
  }
};
