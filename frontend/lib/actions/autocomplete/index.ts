"use server";

import { z } from "zod/v4";

import { cache } from "@/lib/cache";

const AUTOCOMPLETE_MAX_RESULTS_PER_FIELD = 5;

const GetAutocompleteSuggestionsSchema = z.object({
  projectId: z.string(),
  resource: z.enum(["traces", "spans"]),
  prefix: z.string().default(""),
});

export type AutocompleteSuggestion = {
  field: string;
  value: string;
};

function autocompleteKey(resource: string, projectId: string, field: string): string {
  return `autocomplete:${resource}:${projectId}:${field}`;
}

function autocompleteOriginalKey(resource: string, projectId: string, field: string): string {
  return `autocomplete:${resource}:${projectId}:${field}:original`;
}

function autocompleteRange(prefix: string): [string, string] {
  const lowercasePrefix = prefix.toLowerCase();
  const min = `[${lowercasePrefix}`;
  const max = `[${lowercasePrefix}\u00ff`;
  return [min, max];
}

async function mapToOriginalValues(
  resource: string,
  projectId: string,
  field: string,
  lowercaseValues: string[]
): Promise<string[]> {
  if (lowercaseValues.length === 0) {
    return [];
  }

  const originalKey = autocompleteOriginalKey(resource, projectId, field);
  const originals = await cache.hmget(originalKey, lowercaseValues);

  // Map: use original if exists, otherwise use lowercase value
  return lowercaseValues.map((lowercase, index) => originals[index] ?? lowercase);
}

export async function getAutocompleteSuggestions(
  input: z.infer<typeof GetAutocompleteSuggestionsSchema>
): Promise<AutocompleteSuggestion[]> {
  const { projectId, resource, prefix } = GetAutocompleteSuggestionsSchema.parse(input);

  try {
    // If no prefix, return some default suggestions
    if (!prefix) {
      const [namesLowercase, modelsLowercase, tagsLowercase] = await Promise.all([
        cache.zrange(autocompleteKey(resource, projectId, "names"), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1),
        cache.zrange(autocompleteKey(resource, projectId, "models"), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1),
        cache.zrange(autocompleteKey(resource, projectId, "tags"), 0, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD - 1),
      ]);

      // Map to originals
      const [names, models, tags] = await Promise.all([
        mapToOriginalValues(resource, projectId, "names", namesLowercase),
        mapToOriginalValues(resource, projectId, "models", modelsLowercase),
        mapToOriginalValues(resource, projectId, "tags", tagsLowercase),
      ]);

      return [
        ...names.map((value) => ({ field: "name", value })),
        ...models.map((value) => ({ field: "model", value })),
        ...tags.map((value) => ({ field: "tag", value })),
      ];
    }

    const [min, max] = autocompleteRange(prefix);

    const [namesLowercase, modelsLowercase, tagsLowercase] = await Promise.all([
      cache.zrangebylex(autocompleteKey(resource, projectId, "names"), min, max, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD),
      cache.zrangebylex(autocompleteKey(resource, projectId, "models"), min, max, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD),
      cache.zrangebylex(autocompleteKey(resource, projectId, "tags"), min, max, AUTOCOMPLETE_MAX_RESULTS_PER_FIELD),
    ]);

    const [names, models, tags] = await Promise.all([
      mapToOriginalValues(resource, projectId, "names", namesLowercase),
      mapToOriginalValues(resource, projectId, "models", modelsLowercase),
      mapToOriginalValues(resource, projectId, "tags", tagsLowercase),
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
