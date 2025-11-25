import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";

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

export function getStaticSuggestions(prefix: string): AutocompleteSuggestion[] {
  if (!prefix) return [];

  const lowerPrefix = prefix.toLowerCase();

  return STATIC_SUGGESTIONS.filter(
    (s) => s.value.toLowerCase().includes(lowerPrefix) || s.field.toLowerCase().includes(lowerPrefix)
  );
}
