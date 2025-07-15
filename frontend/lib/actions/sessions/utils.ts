import { and, eq, inArray, not, SQL, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { Operator } from "@/components/ui/datatable-filter/utils";
import { FilterBuilder, processors } from "@/lib/actions/common/utils";
import { getTraceSpans, GetTraceSpansSchema } from "@/lib/actions/spans";
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

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;
  const search = req.nextUrl.searchParams.get("search");
  const searchIn = req.nextUrl.searchParams.getAll("searchIn");
  const filters = req.nextUrl.searchParams.getAll("filter");

  const parseResult = GetTraceSpansSchema.safeParse({
    projectId,
    traceId,
    search,
    searchIn,
    filters,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getTraceSpans(parseResult.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace spans." },
      { status: 500 }
    );
  }
}

export const processSessionFilters = (filters: FilterDef[]) => {
  const whereFilters = filters.filter((f) => !AGGREGATE_COLUMNS.has(f.column));
  const havingFilters = filters.filter((f) => AGGREGATE_COLUMNS.has(f.column));

  const whereFilterBuilder = new FilterBuilder<FilterDef, SQL>({
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

  const havingFilterBuilder = new FilterBuilder<FilterDef, SQL>({
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

      const operatorMap: Record<string, string> = {
        eq: "=",
        ne: "!=",
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
      };

      const sqlOperator = operatorMap[filter.operator];
      if (!sqlOperator) return null;

      return sql`${aggregateColumn} ${sql.raw(sqlOperator)} ${filter.value}`;
    },
  });

  return {
    whereFilters: whereFilterBuilder.processFilters(whereFilters),
    havingFilters: havingFilterBuilder.processFilters(havingFilters),
  };
};
