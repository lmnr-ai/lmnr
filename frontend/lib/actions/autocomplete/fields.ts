export const AUTOCOMPLETE_FIELDS: Record<string, string[]> = {
  traces: ["top_span_name", "span_tags", "trace_tags", "span_names"],
  spans: ["name", "tags", "model"],
};

export const FIELD_TO_CACHE_KEY: Record<string, Record<string, string>> = {
  traces: {
    top_span_name: "top_span_names",
    span_tags: "tags",
    trace_tags: "trace_tags",
    span_names: "names",
  },
  spans: {
    name: "names",
    tags: "tags",
    model: "models",
  },
};
