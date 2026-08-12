"use client";

import { type ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter, type StringFilter } from "@/lib/actions/common/filters";
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

const SPAN_NAMES_COLUMN = "span_names";

/**
 * Display-only; persisted operators stay `eq` / `ne`. `!=` is misleading on a
 * set ("some span isn't foo" — almost always true). Overridden locally rather
 * than in the shared `OperatorLabelMap`, which every table filter renders from.
 */
const SPAN_NAMES_OPERATOR_LABELS: Partial<Record<Operator, string>> = {
  [Operator.Eq]: "include",
  [Operator.Ne]: "do not include",
};

/** Operators for a column, with per-column label overrides applied. */
export const getFilterOperations = (columnKey: string): { key: Operator; label: string }[] => {
  const column = SIGNAL_FILTER_COLUMNS.find((c) => c.key === columnKey);
  const operations = dataTypeOperationsMap[column?.dataType ?? "string"] ?? dataTypeOperationsMap.string;

  if (columnKey !== SPAN_NAMES_COLUMN) return operations;
  return operations.map((op) => ({ ...op, label: SPAN_NAMES_OPERATOR_LABELS[op.key] ?? op.label }));
};

/** Word labels need more room than `=`; symbols look lost in a wide box. */
export const getOperatorWidthClass = (columnKey: string): string => (columnKey === SPAN_NAMES_COLUMN ? "w-36" : "w-12");

export const getFilterValuePlaceholder = (columnKey: string): string =>
  columnKey === SPAN_NAMES_COLUMN ? "Span name, e.g. agent.run" : "Enter value...";

export const getDefaultFilter = (): StringFilter => {
  const firstColumn = SIGNAL_FILTER_COLUMNS[0];
  return {
    column: firstColumn.key,
    operator: getFilterOperations(firstColumn.key)[0].key as StringFilter["operator"],
    value: "",
  };
};

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

export const getColumnName = (columnKey: string): string => {
  if (columnKey === TRIGGER_KIND.ROOT_SPAN_FINISHED) return "Root span finished";
  if (columnKey === TRIGGER_KIND.SPAN_NAME) return "Span name";
  return SIGNAL_FILTER_COLUMNS.find((c) => c.key === columnKey)?.name || columnKey;
};

export const getOperatorLabel = (columnKey: string, operator: string): string =>
  getFilterOperations(columnKey).find((op) => op.key === operator)?.label || operator;
