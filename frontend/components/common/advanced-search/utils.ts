import { buildSuggestions, Suggestion } from "@/components/common/advanced-search/components/suggestions.tsx";
import { ColumnFilter, TagFocusPosition } from "@/components/common/advanced-search/types.ts";

const FIELD_ORDER: TagFocusPosition[] = ["field", "operator", "value", "remove"];

export const getNextField = (current: TagFocusPosition): TagFocusPosition | null => {
  const index = FIELD_ORDER.indexOf(current);
  return index < FIELD_ORDER.length - 1 ? FIELD_ORDER[index + 1] : null;
};
export const getPreviousField = (current: TagFocusPosition): TagFocusPosition | null => {
  const index = FIELD_ORDER.indexOf(current);
  return index > 0 ? FIELD_ORDER[index - 1] : null;
};

export interface ValueSuggestion {
  field: string;
  value: string;
}

export const buildValueSuggestions = (
  input: string,
  filters: ColumnFilter[],
  autocompleteData: Map<string, string[]>
): ValueSuggestion[] => {
  const valueSuggestions: ValueSuggestion[] = [];
  const lowerInput = input.toLowerCase();

  autocompleteData.forEach((values, field) => {
    const matchingValues = values.filter((value) => value.toLowerCase().includes(lowerInput));
    matchingValues.forEach((value) => {
      valueSuggestions.push({ field, value });
    });
  });

  filters.forEach((filter) => {
    if (filter.dataType === "enum") {
      const matchingEnumValues = filter.options.filter(
        (opt) =>
          opt.value.toLowerCase().includes(lowerInput) ||
          opt.label.toLowerCase().includes(lowerInput) ||
          filter.name.toLowerCase().includes(lowerInput) ||
          filter.key.toLowerCase().includes(lowerInput)
      );
      matchingEnumValues.forEach((opt) => {
        valueSuggestions.push({ field: filter.key, value: opt.value });
      });
    }
  });

  return valueSuggestions;
};
export const getSuggestionsCount = (
  filters: ColumnFilter[],
  inputValue: string,
  autocompleteData: Map<string, string[]>
): number => buildSuggestions(inputValue, filters, autocompleteData).length;

export const getSuggestionAtIndex = (
  filters: ColumnFilter[],
  inputValue: string,
  index: number,
  autocompleteData: Map<string, string[]>
): Suggestion | null => {
  const suggestions = buildSuggestions(inputValue, filters, autocompleteData);
  return suggestions[index] ?? null;
};
