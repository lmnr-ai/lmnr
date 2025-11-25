import AutocompleteSearchInput from "@/components/common/autocomplete";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { cn } from "@/lib/utils.ts";

const STATIC_FIELD_VALUES: Record<string, string[]> = {
  span_type: ["DEFAULT", "LLM", "PIPELINE", "EXECUTOR", "EVALUATOR", "EVALUATION", "TOOL", "HUMAN_EVALUATOR", "EVENT"],
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

const SearchSpansInput = ({ className }: { className?: string }) => (
  <AutocompleteSearchInput
    className={cn("min-w-32", className)}
    resource="spans"
    placeholder="Search in spans..."
    getStaticSuggestions={getStaticSuggestions}
    posthogEventName="spans_list_searched"
    additionalSearchParams={{
      searchIn: ["input", "output"],
    }}
  />
);

export default SearchSpansInput;
