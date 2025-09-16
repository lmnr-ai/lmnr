import { sql } from "drizzle-orm";

import { DatatableFilter, Operator } from "@/components/ui/datatable-filter/utils";
import { FilterDef } from "@/lib/db/modifiers";

import { SpanMetricGroupBy } from "../clickhouse/types";
import { SpanType } from "./types";

export const SPAN_TYPE_TO_COLOR = {
  [SpanType.DEFAULT]: "rgba(96, 165, 250, 0.7)", // 70% opacity blue
  [SpanType.LLM]: "hsl(var(--llm))", // 90% opacity purple
  [SpanType.EXECUTOR]: "rgba(245, 158, 11, 0.7)", // 70% opacity yellow
  [SpanType.EVALUATOR]: "rgba(6, 182, 212, 0.7)", // 70% opacity cyan
  [SpanType.EVALUATION]: "rgba(16, 185, 129, 0.7)", // 70% opacity green
  [SpanType.HUMAN_EVALUATOR]: "rgba(244, 114, 182, 0.7)",
  [SpanType.TOOL]: "rgba(227, 160, 8, 0.9)",
  [SpanType.EVENT]: "rgba(204, 51, 51, 0.7)",
};

const buildFilters = (groupBy: SpanMetricGroupBy, value: string): DatatableFilter[] => [
  {
    column: groupBy,
    operator: Operator.Eq,
    value,
  },
];

export const buildSpansUrl = (
  projectId: string,
  aggregation: SpanMetricGroupBy,
  value: string,
  pastHours?: string,
  startDate?: string,
  endDate?: string
): string => {
  const params = new URLSearchParams();

  params.set("view", "spans");

  const filters = buildFilters(aggregation, value);
  filters.forEach((filter) => params.append("filter", JSON.stringify(filter)));

  if (pastHours) {
    params.set("pastHours", pastHours);
  } else if (startDate && endDate) {
    params.set("startDate", startDate);
    params.set("endDate", endDate);
  }

  return `/project/${projectId}/traces?${params.toString()}`;
};

// If the span hadn't arrived in one hour, it's probably not going to arrive.
const MILLISECONDS_DATE_THRESHOLD = 1000 * 60 * 60; // 1 hour

export const isStringDateOld = (date: string) => {
  const d = new Date(date);
  return d < new Date(Date.now() - MILLISECONDS_DATE_THRESHOLD);
};

export const createModelFilter = (filter: FilterDef) => {
  const requestModelColumn = sql`(attributes ->> 'gen_ai.request.model')::text`;
  const responseModelColumn = sql`(attributes ->> 'gen_ai.response.model')::text`;

  const operators = {
    eq: (value: string) =>
      sql`(${requestModelColumn} LIKE ${`%${value}%`} OR ${responseModelColumn} LIKE ${`%${value}%`})`,

    ne: (value: string) =>
      sql`((${requestModelColumn} NOT LIKE ${`%${value}%`} OR ${requestModelColumn} IS NULL) AND (${responseModelColumn} NOT LIKE ${`%${value}%`} OR ${responseModelColumn} IS NULL))`,
  };

  return operators[filter.operator as keyof typeof operators]?.(filter.value) ?? sql`1=1`;
};
