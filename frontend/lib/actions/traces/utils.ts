import { and, eq, inArray, not, SQL, sql } from "drizzle-orm";

import { Operator } from "@/components/ui/datatable-filter/utils";
import { processFilters, processors } from "@/lib/actions/common/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";

enum AllowedCastType {
  TraceType = "trace_type",
  SpanType = "span_type",
}

export const processTraceFilters = (filters: FilterDef[]) =>
  processFilters<FilterDef, SQL>(filters, {
    processors: processors<FilterDef, SQL>([
      {
        column: "tags",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          const labelName = filter.value;
          const inArrayFilter = inArray(
            sql`id`,
            db
              .select({ id: spans.traceId })
              .from(spans)
              .innerJoin(labels, eq(spans.spanId, labels.spanId))
              .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
              .where(and(eq(labelClasses.name, labelName)))
          );
          return filter.operator === "eq" ? inArrayFilter : not(inArrayFilter);
        },
      },
      {
        column: "metadata",
        operators: [Operator.Eq],
        process: (filter) => {
          const [key, value] = filter.value.split(/=(.*)/);
          return sql`metadata @> ${JSON.stringify({ [key]: value })}`;
        },
      },
      {
        column: "traceType",
        process: (filter) => filtersToSql([{ ...filter, castType: AllowedCastType.TraceType }], [], {})[0],
      },
      {
        column: "spanType",
        process: (filter) => {
          const uppercased = filter.value.toUpperCase().trim();
          const value = uppercased === "SPAN" ? "'DEFAULT'" : `'${uppercased}'`;
          return filtersToSql([{ ...filter, value, castType: AllowedCastType.SpanType }], [], {})[0];
        },
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
    defaultProcessor: (filter) => filtersToSql([filter], [], {})[0] || null,
  });
