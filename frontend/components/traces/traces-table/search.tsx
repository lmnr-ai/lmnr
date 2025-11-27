import { memo } from "react";

import AutocompleteSearchInput from "@/components/common/autocomplete";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { cn } from "@/lib/utils.ts";

const STATIC_FIELD_VALUES: Record<string, string[]> = {
  top_span_type: [
    "DEFAULT",
    "LLM",
    "PIPELINE",
    "EXECUTOR",
    "EVALUATOR",
    "EVALUATION",
    "TOOL",
    "HUMAN_EVALUATOR",
    "EVENT",
  ],
  status: ["success", "error"],
};

const STATIC_SUGGESTIONS: AutocompleteSuggestion[] = Object.entries(STATIC_FIELD_VALUES).flatMap(([field, values]) =>
  values.map((value) => ({ field, value }))
);

const getStaticSuggestions = (prefix: string): AutocompleteSuggestion[] => {
  if (!prefix) return [];

  const lowerPrefix = prefix.toLowerCase();

  return STATIC_SUGGESTIONS.filter(
    (s) => s.value.toLowerCase().includes(lowerPrefix) || s.field.toLowerCase().includes(lowerPrefix)
  );
};

const SearchTracesInput = ({ className }: { className?: string }) => (
  <AutocompleteSearchInput
    className={cn("min-w-32", className)}
    resource="traces"
    placeholder="Search in traces..."
    getStaticSuggestions={getStaticSuggestions}
    posthogEventName="traces_list_searched"
    additionalSearchParams={{
      searchIn: ["input", "output"],
    }}
  />
);

export default memo(SearchTracesInput);
