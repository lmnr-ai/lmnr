import { and, eq, inArray, not, sql } from "drizzle-orm";

import { Operator } from "@/components/ui/datatable-filter/utils";
import { processFilters, processors } from "@/lib/actions/common/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { createModelFilter } from "@/lib/traces/utils";

export enum AllowedCastType {
  SpanType = "span_type",
}

const processAttributeFilter = (filter: FilterDef): FilterDef => {
  switch (filter.column) {
    case "span_id":
      return {
        ...filter,
        value: filter.value.startsWith("00000000-0000-0000-") ? filter.value : `00000000-0000-0000-${filter.value}`,
      };

    case "path":
      return { ...filter, column: "(attributes ->> 'lmnr.span.path')" };

    case "input_token_count":
      return { ...filter, column: "(attributes ->> 'gen_ai.usage.input_tokens')::int8" };

    case "output_token_count":
      return { ...filter, column: "(attributes ->> 'gen_ai.usage.output_tokens')::int8" };

    case "tokens":
      return { ...filter, column: "(attributes ->> 'llm.usage.total_tokens')::int8" };

    case "input_cost":
      return { ...filter, column: "(attributes ->> 'gen_ai.usage.input_cost')::float8" };

    case "output_cost":
      return { ...filter, column: "(attributes ->> 'gen_ai.usage.output_cost')::float8" };

    case "cost":
      return { ...filter, column: "(attributes ->> 'gen_ai.usage.cost')::float8" };

    case "span_type": {
      const uppercased = filter.value.toUpperCase().trim();
      const newValue = uppercased === "SPAN" ? "'DEFAULT'" : `'${uppercased}'`;
      return { ...filter, value: newValue, castType: AllowedCastType.SpanType };
    }

    default:
      return filter;
  }
};

const processTraceSpanAttributeFilter = (filter: FilterDef): FilterDef => {
  switch (filter.column) {
    case "path":
      return { ...filter, column: "(attributes ->> 'lmnr.span.path')" };

    case "tokens":
      return { ...filter, column: "(attributes ->> 'llm.usage.total_tokens')::int8" };

    case "cost":
      return { ...filter, column: "(attributes ->> 'gen_ai.usage.cost')::float8" };

    default:
      return filter;
  }
};

export const processSpanFilters = (filters: FilterDef[]) =>
  processFilters<FilterDef, any>(filters, {
    processors: processors<FilterDef, any>([
      {
        column: "tags",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          const inArrayFilter = inArray(
            sql`span_id`,
            db
              .select({ span_id: spans.spanId })
              .from(spans)
              .innerJoin(labels, eq(spans.spanId, labels.spanId))
              .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
              .where(and(eq(labelClasses.name, filter.value)))
          );
          return filter.operator === "eq" ? inArrayFilter : not(inArrayFilter);
        },
      },
      {
        column: "model",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => createModelFilter(filter),
      },
      {
        column: "status",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          if (filter.value === "success") {
            return filter.operator === "eq" ? sql`status IS NULL` : sql`status IS NOT NULL`;
          } else if (filter.value === "error") {
            return filter.operator === "eq" ? sql`status = 'error'` : sql`status IS NULL`;
          }
          return sql`1=1`;
        },
      },
    ]),
    defaultProcessor: (filter) => {
      const processed = processAttributeFilter(filter);
      return (
        filtersToSql([processed], [new RegExp(/^\(attributes\s*->>\s*'[a-zA-Z_\.]+'\)(?:::int8|::float8)?$/)], {
          latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`,
          path: sql<string>`attributes ->> 'lmnr.span.path'`,
        })[0] || null
      );
    },
  });

export const processTraceSpanFilters = (filters: FilterDef[]) =>
  processFilters<FilterDef, any>(filters, {
    processors: processors<FilterDef, any>([
      {
        column: "status",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          if (filter.value === "success") {
            return filter.operator === "eq" ? sql`status IS NULL` : sql`status IS NOT NULL`;
          } else if (filter.value === "error") {
            return filter.operator === "eq" ? sql`status = 'error'` : sql`status != 'error' OR status IS NULL`;
          }
          return sql`1=1`;
        },
      },
      {
        column: "tags",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          const name = filter.value;
          const inArrayFilter = inArray(
            spans.spanId,
            db
              .select({ span_id: spans.spanId })
              .from(spans)
              .innerJoin(labels, eq(spans.spanId, labels.spanId))
              .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
              .where(and(eq(labelClasses.name, name)))
          );
          return filter.operator === "eq" ? inArrayFilter : not(inArrayFilter);
        },
      },
      {
        column: "model",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => createModelFilter(filter),
      },
    ]),
    defaultProcessor: (filter) => {
      const processed = processTraceSpanAttributeFilter(filter);
      return (
        filtersToSql([processed], [new RegExp(/^\(attributes\s*->>\s*'[a-zA-Z_\.]+'\)(?:::int8|::float8)?$/)], {
          latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`,
        })[0] || null
      );
    },
  });
