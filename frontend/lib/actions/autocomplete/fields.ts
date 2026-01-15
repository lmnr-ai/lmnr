export const AUTOCOMPLETE_FIELDS: Record<string, string[]> = {
  traces: ["top_span_name", "tags"],
  spans: ["name", "tags", "model"],
};

export const FIELD_TO_CACHE_KEY: Record<string, Record<string, string>> = {
  traces: {
    top_span_name: "top_span_names",
    tags: "tags",
  },
  spans: {
    name: "names",
    tags: "tags",
    model: "models",
  },
};
