import { and, eq, inArray, not, SQL, sql } from "drizzle-orm";

import { Operator, OperatorLabelMap } from "@/components/ui/datatable-filter/utils";
import { processFilters, processors } from "@/lib/actions/common/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";

enum AllowedCastType {
  TraceType = "trace_type",
  SpanType = "span_type",
}

const AGGREGATE_COLUMNS = new Set([
  "trace_count",
  "input_token_count",
  "output_token_count",
  "total_token_count",
  "cost",
  "input_cost",
  "output_cost",
  "duration",
]);

export const processSessionFilters = (filters: FilterDef[]) => {
  const whereFilters = filters.filter((f) => !AGGREGATE_COLUMNS.has(f.column));
  const havingFilters = filters.filter((f) => AGGREGATE_COLUMNS.has(f.column));

  const whereFiltersResult = processFilters<FilterDef, SQL>(whereFilters, {
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
          return filter.operator === Operator.Eq ? inArrayFilter : not(inArrayFilter);
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
        column: "trace_id",
        process: (filter) =>
          // Map trace_id to the actual column name 'id' in the traces table
          filtersToSql([{ ...filter, column: "id" }], [], {})[0],
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
    ]),
    defaultProcessor: (filter) =>
      filtersToSql([filter], [], {
        duration: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))::float8`,
      })[0] || null,
  });

  const havingFiltersResult = processFilters<FilterDef, SQL>(havingFilters, {
    defaultProcessor: (filter) => {
      const aggregateColumnMap: Record<string, SQL> = {
        trace_count: sql`COUNT(id)`,
        input_token_count: sql`SUM(input_token_count)`,
        output_token_count: sql`SUM(output_token_count)`,
        total_token_count: sql`SUM(total_token_count)`,
        cost: sql`SUM(cost)`,
        input_cost: sql`SUM(input_cost)`,
        output_cost: sql`SUM(output_cost)`,
        duration: sql`SUM(EXTRACT(EPOCH FROM (end_time - start_time)))`,
      };

      const aggregateColumn = aggregateColumnMap[filter.column];
      if (!aggregateColumn) return null;

      const sqlOperator = OperatorLabelMap[filter.operator];
      if (!sqlOperator) return null;

      return sql`${aggregateColumn} ${sql.raw(sqlOperator)} ${filter.value}`;
    },
  });

  return {
    whereFilters: whereFiltersResult,
    havingFilters: havingFiltersResult,
  };
};
