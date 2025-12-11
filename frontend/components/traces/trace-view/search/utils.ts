
import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
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

  for (const span of spans) {
    if (span.name) nameSet.add(span.name);
    if (span.model) modelSet.add(span.model);
  }

  return [
    ...Array.from(nameSet, (name) => ({ field: "name", value: name })),
    ...Array.from(modelSet, (model) => ({ field: "model", value: model })),
  ];
};
