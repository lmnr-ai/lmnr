import { uniq } from "lodash";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { SpanType } from "@/lib/traces/types";

export const STATIC_SPAN_SUGGESTIONS: AutocompleteSuggestion[] = [
  ...Object.values(SpanType).map((value) => ({
    field: "span_type",
    value,
  })),
  { field: "status", value: "success" },
  { field: "status", value: "error" },
];

export const extractSpanSuggestions = (spans: TraceViewSpan[]): AutocompleteSuggestion[] => {
  const suggestions: AutocompleteSuggestion[] = [];

  const spanNames = uniq(spans.map((span) => span.name).filter(Boolean));
  spanNames.forEach((name) => {
    suggestions.push({ field: "name", value: name });
  });

  const rootSpan = spans.find((span) => !span.parentSpanId);
  if (rootSpan) {
    suggestions.push({ field: "top_span_name", value: rootSpan.name });
  }

  return suggestions;
};
