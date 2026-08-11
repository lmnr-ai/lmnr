import { type ColumnFilter, type TagFocusPosition } from "@/components/common/advanced-search/types.ts";

const FIELD_ORDER: TagFocusPosition[] = ["field", "operator", "value", "remove"];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_REGEX.test(value.trim());

// Single source of truth for "does this input resolve to the id suggestion",
// shared by the suggestion list builder and the store's pre-selection so the
// two can never drift apart.
export const hasUuidSuggestion = (value: string, filters: ColumnFilter[], uuidFilterColumn?: string): boolean =>
  !!uuidFilterColumn && isUuid(value) && filters.some((f) => f.key === uuidFilterColumn);

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
  label?: string;
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
        valueSuggestions.push({ field: filter.key, value: opt.value, label: opt.label });
      });
    }
  });

  return valueSuggestions;
};
