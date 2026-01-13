import { get, isArray } from "lodash";

import { TraceViewSpan } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store.tsx";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { SpanType } from "@/lib/traces/types.ts";

export const STATIC_SPAN_SUGGESTIONS: AutocompleteSuggestion[] = [
  ...Object.values(SpanType).map((value) => ({
    field: "span_type",
    value,
  })),
  { field: "status", value: "success" },
  { field: "status", value: "error" },
];

export const extractSpanSuggestions = (spans: TraceViewSpan[]): AutocompleteSuggestion[] => {
  const nameSet = new Set<string>();
  const modelSet = new Set<string>();
  const tagsSet = new Set<string>();

  for (const span of spans) {
    if (span.name) nameSet.add(span.name);
    if (span.model) modelSet.add(span.model);
    const tags = get(span.attributes, "lmnr.association.properties.tags");
    if (isArray(tags)) {
      tags.forEach((tag) => tagsSet.add(tag));
    }
  }

  return [
    ...Array.from(nameSet, (name) => ({ field: "name", value: name })),
    ...Array.from(modelSet, (model) => ({ field: "model", value: model })),
    ...Array.from(tagsSet, (tag) => ({ field: "tag", value: tag })),
  ];
};

