import { z } from "zod/v4";

import { getTopSuggestions, isAutocompleteCacheExists } from "@/lib/actions/autocomplete/cache.ts";
import { FIELD_TO_CACHE_KEY } from "@/lib/actions/autocomplete/fields";
import { executeQuery } from "@/lib/actions/sql";

const GetAutocompleteSuggestionsSchema = z.object({
  projectId: z.string(),
  entity: z.enum(["traces", "spans"]),
  field: z.string().optional(),
});

export type AutocompleteSuggestion = {
  field: string;
  value: string;
};

const getSuggestions = async (resource: string, projectId: string, field: string): Promise<string[]> => {
  const exists = await isAutocompleteCacheExists("spans", projectId, "names");

  if (exists) {
    return await getTopSuggestions(resource, projectId, field);
  }

  const { queries } = getAutocompleteQueries(field);
  const results = await Promise.all(queries.map((query) => executeQuery<{ value: string }>({ query, projectId })));

  return results.flatMap((result) => result.map((r) => r.value));
};

const getSpansSuggestions = async (projectId: string): Promise<AutocompleteSuggestion[]> => {
  const [names, tags, models] = await Promise.all([
    getSuggestions("spans", projectId, "names"),
    getSuggestions("spans", projectId, "tags"),
    getSuggestions("spans", projectId, "models"),
  ]);

  return [
    ...names.map((value) => ({ field: "name", value })),
    ...models.map((value) => ({ field: "model", value })),
    ...tags.map((value) => ({ field: "tags", value })),
  ];
};

const getTracesSuggestions = async (projectId: string): Promise<AutocompleteSuggestion[]> => {
  const [topSpanNames, spanNames, tags] = await Promise.all([
    getSuggestions("spans", projectId, "top_span_names"),
    getSuggestions("spans", projectId, "names"),
    getSuggestions("spans", projectId, "tags"),
  ]);

  return [
    ...topSpanNames.map((value) => ({ field: "top_span_name", value })),
    ...spanNames.map((value) => ({ field: "span_names", value })),
    ...tags.map((value) => ({ field: "tags", value })),
  ];
};

const getFieldSuggestions = async (
  entity: "traces" | "spans",
  projectId: string,
  field: string
): Promise<AutocompleteSuggestion[]> => {
  const cacheKey = FIELD_TO_CACHE_KEY[entity]?.[field];
  if (!cacheKey) {
    return [];
  }

  const values = await getSuggestions("spans", projectId, cacheKey);
  return values.map((value) => ({ field, value }));
};

export async function getAutocompleteSuggestions(
  input: z.infer<typeof GetAutocompleteSuggestionsSchema>
): Promise<AutocompleteSuggestion[]> {
  const { projectId, entity, field } = GetAutocompleteSuggestionsSchema.parse(input);

  // If a specific field is requested, only fetch for that field
  if (field) {
    return await getFieldSuggestions(entity, projectId, field);
  }

  if (entity === "spans") {
    return await getSpansSuggestions(projectId);
  } else {
    return await getTracesSuggestions(projectId);
  }
}

const getAutocompleteQueries = (field: string): { queries: string[] } => {
  switch (field) {
    case "names":
      return {
        queries: [
          `SELECT arrayJoin(topK(512)(name)) as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND name != ''`,
        ],
      };
    case "top_span_names":
      return {
        queries: [
          `SELECT arrayJoin(topK(512)(name)) as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND name != ''`,
        ],
      };
    case "models":
      return {
        queries: [
          `SELECT arrayJoin(topK(256)(request_model)) as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND request_model != ''`,
          `SELECT arrayJoin(topK(256)(response_model)) as value FROM spans WHERE start_time >= now() - INTERVAL 7 days AND start_time < now() AND response_model != ''`,
        ],
      };
    case "tags":
      return {
        queries: [
          `SELECT arrayJoin(topK(512)(name)) as value FROM tags WHERE created_at >= now() - INTERVAL 7 days AND created_at < now() AND name != ''`,
        ],
      };
    default:
      return { queries: [] };
  }
};
