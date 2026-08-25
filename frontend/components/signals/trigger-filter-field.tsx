"use client";

import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";

/** Trigger kinds a signal can be evaluated on. A signal has exactly one. */
export const TRIGGER_KIND = {
  ROOT_SPAN_FINISHED: "root_span_finished",
  SPAN_NAME: "span_name",
} as const;

export type TriggerKind = (typeof TRIGGER_KIND)[keyof typeof TRIGGER_KIND];

/**
 * Filter columns. Deliberately narrow: filters are evaluated against the
 * trace's cumulative state, which the backend reads back out of ClickHouse, so
 * every entry here needs a column in that read (`ch/private/trace_stats.rs`).
 */
export const SIGNAL_FILTER_COLUMNS: ColumnFilter[] = [
  { name: "Total tokens", key: "total_token_count", dataType: "number" },
  {
    name: "Status",
    key: "status",
    dataType: "enum",
    options: [
      { label: "Success", value: "success" },
      { label: "Error", value: "error" },
    ],
  },
  // Plural: a statement about the trace's whole set of span names, matched
  // anywhere in the trace (the `span_name` TRIGGER sees only the firing batch).
  { name: "Span names", key: "span_names", dataType: "string" },
];

export const getRootSpanFinishedCondition = (): Filter => ({
  column: TRIGGER_KIND.ROOT_SPAN_FINISHED,
  operator: Operator.Eq,
  value: "true",
});

/**
 * `includes` is what the shared `FilterSchema` requires for an array value, and
 * it reads correctly: the trace's spans include any of these names.
 */
export const getSpanNameCondition = (spanNames: string[]): Filter => ({
  column: TRIGGER_KIND.SPAN_NAME,
  operator: Operator.Includes,
  value: spanNames,
});

/** The kind a persisted condition list represents; defaults to root-span. */
export const getTriggerKind = (conditions: Filter[]): TriggerKind =>
  conditions.some((c) => c.column === TRIGGER_KIND.SPAN_NAME)
    ? TRIGGER_KIND.SPAN_NAME
    : TRIGGER_KIND.ROOT_SPAN_FINISHED;

/**
 * Span names in a condition list, tolerating the legacy single-string shape.
 * Blank entries are PRESERVED — they're the in-progress rows the user is about
 * to type into, and dropping them here would make "Add span name" a no-op.
 * `stripBlankSpanNames` cleans them up on save; the backend also ignores blanks.
 */
export const getTriggerSpanNames = (conditions: Filter[]): string[] => {
  const condition = conditions.find((c) => c.column === TRIGGER_KIND.SPAN_NAME);
  if (!condition) return [];
  if (Array.isArray(condition.value)) return condition.value.map(String);
  return condition.value ? [String(condition.value)] : [];
};

/** Drop the empty rows the UI keeps for typing before persisting a trigger. */
export const stripBlankSpanNames = (conditions: Filter[]): Filter[] =>
  conditions.map((c) =>
    c.column === TRIGGER_KIND.SPAN_NAME && Array.isArray(c.value)
      ? getSpanNameCondition(c.value.map(String).filter((name) => name.trim() !== ""))
      : c
  );
