import { type ColumnFilter, type TagFocusPosition } from "@/components/common/advanced-search/types.ts";

const FIELD_ORDER: TagFocusPosition[] = ["field", "operator", "value", "remove"];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => UUID_REGEX.test(value.trim());

// Single source of truth for "does this input resolve to the id suggestion",
// shared by the suggestion list builder and the store's pre-selection so the
// two can never drift apart.
export const hasUuidSuggestion = (value: string, filters: ColumnFilter[], uuidFilterColumn?: string): boolean =>
  !!uuidFilterColumn && isUuid(value) && filters.some((f) => f.key === uuidFilterColumn);

// `skip` holds positions that render as static text (a single-option operator),
// so arrow keys step over them instead of landing on nothing focusable.
export const getNextField = (current: TagFocusPosition, skip: TagFocusPosition[] = []): TagFocusPosition | null => {
  let index = FIELD_ORDER.indexOf(current) + 1;
  while (index < FIELD_ORDER.length && skip.includes(FIELD_ORDER[index])) index++;
  return index < FIELD_ORDER.length ? FIELD_ORDER[index] : null;
};
export const getPreviousField = (current: TagFocusPosition, skip: TagFocusPosition[] = []): TagFocusPosition | null => {
  let index = FIELD_ORDER.indexOf(current) - 1;
  while (index >= 0 && skip.includes(FIELD_ORDER[index])) index--;
  return index >= 0 ? FIELD_ORDER[index] : null;
};

// null selection: inputs without a caret (type=number).
export const isCaretAtStart = (input: HTMLInputElement) => input.selectionStart === null || input.selectionStart === 0;
export const isCaretAtEnd = (input: HTMLInputElement) =>
  input.selectionStart === null || input.selectionStart === input.value.length;

// Scrolls only the list; scrollIntoView can scroll the page too.
export const scrollOptionIntoView = (viewport: HTMLElement | null, option: HTMLElement | null | undefined) => {
  if (!viewport || !option) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < viewport.scrollTop) viewport.scrollTop = top;
  else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
};

export interface ValueSuggestion {
  field: string;
  value: string;
  label?: string;
}

export const displayFilterValue = (columnFilter: ColumnFilter | undefined, value: string | string[]): string => {
  const parts = Array.isArray(value) ? value : [String(value)];
  if (columnFilter?.dataType !== "enum") return parts.join(", ");
  return parts.map((part) => columnFilter.options.find((option) => option.value === part)?.label ?? part).join(", ");
};

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

export type Suggestion =
  | { type: "field"; filter: ColumnFilter }
  | ({ type: "value" } & ValueSuggestion)
  | { type: "raw_search"; value: string };

export const buildSuggestions = (
  inputValue: string,
  filters: ColumnFilter[],
  autocompleteData: Map<string, string[]>,
  uuidFilterColumn?: string,
  allowFreeTextSearch = true
): Suggestion[] => {
  const input = inputValue.trim().toLowerCase();

  if (!input) {
    return filters.map((filter) => ({ type: "field" as const, filter }));
  }

  // A pasted UUID is an id, not prose — offer the exact-match filter first.
  const uuidSuggestions: Suggestion[] = hasUuidSuggestion(input, filters, uuidFilterColumn)
    ? [{ type: "value" as const, field: uuidFilterColumn as string, value: inputValue.trim() }]
    : [];

  const matchingFields = filters.filter(
    (f) => f.name.toLowerCase().includes(input) || f.key.toLowerCase().includes(input)
  );

  const fieldSuggestions: Suggestion[] = matchingFields.map((filter) => ({
    type: "field" as const,
    filter,
  }));

  const valueSuggestions: Suggestion[] = buildValueSuggestions(input, filters, autocompleteData).map(
    ({ field, value, label }) => ({ type: "value" as const, field, value, label })
  );

  return [
    ...uuidSuggestions,
    ...fieldSuggestions,
    ...valueSuggestions,
    ...(allowFreeTextSearch ? [{ type: "raw_search" as const, value: inputValue.trim() }] : []),
  ];
};
