import { isEmpty } from "lodash";
import { z } from "zod/v4";

import { getTopSuggestions, searchSuggestions } from "@/lib/actions/autocomplete/cache.ts";
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

const getSuggestions = async (resource: string, projectId: string, field: string) => {
  const cacheResults = await getTopSuggestions(resource, projectId, "names");

  if (!isEmpty(cacheResults)) {
    return cacheResults;
  }
  const queries = getAutocompleteQueries(field);
  const results = await Promise.all(queries.map((query) => executeQuery<{ value: string }>({ query, projectId })));

  return results.flatMap((result) => result.map((r) => r.value));
};

const getSpansSuggestions = async (projectId: string, prefix: string): Promise<AutocompleteSuggestion[]> => {
  if (prefix) {
    const [names, tags, models] = await Promise.all([
      searchSuggestions("spans", projectId, "names", prefix),
      searchSuggestions("spans", projectId, "tags", prefix),
      searchSuggestions("spans", projectId, "models", prefix),
    ]);

    return [
      ...names.map((value) => ({ field: "name", value })),
      ...models.map((value) => ({ field: "model", value })),
      ...tags.map((value) => ({ field: "tag", value })),
    ];
  }
  const [names, tags, models] = await Promise.all([
    getSuggestions("spans", projectId, "names"),
    getSuggestions("spans", projectId, "tags"),
    getSuggestions("spans", projectId, "models"),
  ]);

  return [
    ...names.map((value) => ({ field: "name", value })),
    ...models.map((value) => ({ field: "model", value })),
    ...tags.map((value) => ({ field: "tag", value })),
  ];
};

const getTracesSuggestions = async (projectId: string, prefix: string): Promise<AutocompleteSuggestion[]> => {
  if (prefix) {
    const [names, tags] = await Promise.all([
      searchSuggestions("spans", projectId, "top_span_names", prefix),
      searchSuggestions("spans", projectId, "tags", prefix),
    ]);
    return [
      ...names.map((value) => ({ field: "top_span_name", value })),
      ...tags.map((value) => ({ field: "tag", value })),
    ];
  }

  const [names, tags] = await Promise.all([
    getSuggestions("spans", projectId, "top_span_names"),
    getSuggestions("spans", projectId, "tags"),
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

const getAutocompleteQueries = (field: string): string[] => {
  switch (field) {
    case "names":
      return [
        `SELECT DISTINCT name as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND name != '' ORDER BY start_time DESC LIMIT 5`,
      ];
    case "top_span_names":
      return [
        `SELECT DISTINCT name as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND name != '' ORDER BY start_time DESC LIMIT 5`,
      ];
    case "models":
      return [
        `SELECT DISTINCT request_model as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND request_model != '' ORDER BY start_time DESC LIMIT 5`,
        `SELECT DISTINCT response_model as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND response_model != '' ORDER BY start_time DESC LIMIT 5`,
      ];
    case "tags":
      return [
        `SELECT DISTINCT name as value FROM tags WHERE created_at >= now() - INTERVAL 7 days AND created_at < now() ORDER BY created_at DESC LIMIT 5`,
      ];
    default:
      return [];
  }
};
