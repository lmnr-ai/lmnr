import { type ColumnFilter, type TagFocusPosition } from "@/components/common/advanced-search/types.ts";

const FIELD_ORDER: TagFocusPosition[] = ["field", "operator", "value", "remove"];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_REGEX.test(value.trim());

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

// Match scores, highest first. A candidate that only matches as a subsequence
// ("tsn" → "top_span_name") still ranks, but well below a real prefix hit.
const SCORE_EXACT = 100;
const SCORE_PREFIX = 80;
const SCORE_WORD_PREFIX = 60;
const SCORE_SUBSTRING = 40;
const SCORE_SUBSEQUENCE = 20;

// A field whose NAME matches gets its values offered even when the values
// themselves don't contain the input ("model" → the list of models). Below a
// substring hit on the value itself, above a subsequence one.
const SCORE_FIELD_MATCH_VALUE = 30;
const FIELD_MATCH_MIN_SCORE = SCORE_WORD_PREFIX;

const WORD_BOUNDARY = /[\s\-_./:@]/;

const isSubsequence = (query: string, candidate: string): boolean => {
  let index = 0;
  for (const char of candidate) {
    if (char === query[index]) index++;
    if (index === query.length) return true;
  }
  return false;
};

/**
 * Rank `candidate` against `query`. Returns null when they don't match at all.
 * Ties are broken toward shorter candidates so "gpt-4o" beats "gpt-4o-mini-…".
 */
export const matchScore = (candidate: string, query: string): number | null => {
  const value = candidate.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;

  const lengthPenalty = Math.min(value.length, 100) / 1000;

  if (value === q) return SCORE_EXACT;
  if (value.startsWith(q)) return SCORE_PREFIX - lengthPenalty;

  const index = value.indexOf(q);
  if (index > 0) {
    const isWordStart = WORD_BOUNDARY.test(value[index - 1]);
    return (isWordStart ? SCORE_WORD_PREFIX : SCORE_SUBSTRING) - lengthPenalty;
  }

  return isSubsequence(q, value) ? SCORE_SUBSEQUENCE - lengthPenalty : null;
};

/** Best score of a query against a column's display name or its raw key. */
const fieldMatchScore = (filter: ColumnFilter, query: string): number | null => {
  const scores = [matchScore(filter.name, query), matchScore(filter.key, query)].filter(
    (score): score is number => score !== null
  );
  return scores.length > 0 ? Math.max(...scores) : null;
};

/** Rank `filters` against a query, dropping non-matches. Best match first. */
export const rankFilters = (filters: ColumnFilter[], query: string): ColumnFilter[] =>
  filters
    .map((filter) => ({ filter, score: fieldMatchScore(filter, query) }))
    .filter((entry): entry is { filter: ColumnFilter; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.filter);

/** Rank raw autocomplete values against a query, dropping non-matches. */
export const rankValues = (values: string[], query: string, limit?: number): string[] => {
  const ranked = values
    .map((value) => ({ value, score: matchScore(value, query) }))
    .filter((entry): entry is { value: string; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.value);

  return limit === undefined ? ranked : ranked.slice(0, limit);
};

// Without a cap, a single character matches hundreds of cached span names and
// buries the field suggestions under a scroll wall.
const MAX_VALUE_SUGGESTIONS_PER_FIELD = 5;
const MAX_VALUE_SUGGESTIONS = 12;

export const buildValueSuggestions = (
  input: string,
  filters: ColumnFilter[],
  autocompleteData: Map<string, string[]>
): ValueSuggestion[] => {
  const scored: { suggestion: ValueSuggestion; score: number }[] = [];

  const collect = (field: string, entries: { value: string; label?: string; score: number }[]) => {
    entries
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_VALUE_SUGGESTIONS_PER_FIELD)
      .forEach(({ value, label, score }) => scored.push({ suggestion: { field, value, label }, score }));
  };

  const scoreFor = (candidates: string[], fieldScore: number | null): number | null => {
    const best = candidates
      .map((candidate) => matchScore(candidate, input))
      .filter((score): score is number => score !== null);
    const valueScore = best.length > 0 ? Math.max(...best) : null;
    if (fieldScore !== null && fieldScore >= FIELD_MATCH_MIN_SCORE) {
      return Math.max(valueScore ?? 0, SCORE_FIELD_MATCH_VALUE);
    }
    return valueScore;
  };

  autocompleteData.forEach((values, field) => {
    const columnFilter = filters.find((f) => f.key === field);
    const fieldScore = columnFilter ? fieldMatchScore(columnFilter, input) : null;

    collect(
      field,
      values.flatMap((value) => {
        const score = scoreFor([value], fieldScore);
        return score === null ? [] : [{ value, score }];
      })
    );
  });

  filters.forEach((filter) => {
    if (filter.dataType !== "enum") return;
    const fieldScore = fieldMatchScore(filter, input);

    collect(
      filter.key,
      filter.options.flatMap((option) => {
        const score = scoreFor([option.value, option.label], fieldScore);
        return score === null ? [] : [{ value: option.value, label: option.label, score }];
      })
    );
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VALUE_SUGGESTIONS)
    .map((entry) => entry.suggestion);
};
