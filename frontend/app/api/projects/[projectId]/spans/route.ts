import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { searchSpans } from "@/lib/clickhouse/spans";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { getDateRangeFilters, paginatedGet } from "@/lib/db/utils";
import { Span } from "@/lib/traces/types";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const pastHours = req.nextUrl.searchParams.get("pastHours");
  const startTime = req.nextUrl.searchParams.get("startDate");
  const endTime = req.nextUrl.searchParams.get("endDate");
  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;

  let urlParamFilters: FilterDef[] = [];
  try {
    urlParamFilters = JSON.parse(req.nextUrl.searchParams.get("filter") ?? "[]") as FilterDef[];
  } catch (e) {
    urlParamFilters = [];
  }
  if (!Array.isArray(urlParamFilters)) {
    urlParamFilters = [];
  }

  const labelFilters = urlParamFilters
    .filter((filter) => filter.column === "labels" && filter.operator === "eq")
    .map((filter) => {
      const labelName = filter.value.split(/=(.*)/)?.[0];
      return inArray(
        sql`span_id`,
        db
          .select({ span_id: spans.spanId })
          .from(spans)
          .innerJoin(labels, eq(spans.spanId, labels.spanId))
          .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
          .where(and(eq(labelClasses.name, labelName)))
      );
    });

  let searchSpanIds = null;
  if (req.nextUrl.searchParams.get("search")) {
    const timeRange = getTimeRange(pastHours ?? undefined, startTime ?? undefined, endTime ?? undefined);
    const searchResult = await searchSpans(projectId, req.nextUrl.searchParams.get("search") ?? "", timeRange);
    searchSpanIds = Array.from(searchResult.spanIds);
  }

  const textSearchFilters = searchSpanIds ? [inArray(sql`span_id`, searchSpanIds)] : [];

  urlParamFilters = urlParamFilters
    // labels are handled separately above
    .filter((filter) => filter.column !== "labels")
    .map((filter) => {
      if (filter.column === "span_id") {
        filter.value = filter.value.startsWith("00000000-0000-0000-")
          ? filter.value
          : `00000000-0000-0000-${filter.value}`;
      } else if (filter.column == "path") {
        filter.column = "(attributes ->> 'lmnr.span.path')";
      } else if (filter.column === "input_token_count") {
        filter.column = "(attributes ->> 'gen_ai.usage.input_tokens')::int8";
      } else if (filter.column === "output_token_count") {
        filter.column = "(attributes ->> 'gen_ai.usage.output_tokens')::int8";
      } else if (filter.column === "total_token_count") {
        filter.column = "(attributes ->> 'llm.usage.total_tokens')::int8";
      } else if (filter.column === "input_cost") {
        filter.column = "(attributes ->> 'gen_ai.usage.input_cost')::float8";
      } else if (filter.column === "output_cost") {
        filter.column = "(attributes ->> 'gen_ai.usage.output_cost')::float8";
      } else if (filter.column === "cost") {
        filter.column = "(attributes ->> 'gen_ai.usage.cost')::float8";
      } else if (filter.column === "span_type") {
        // cast to span_type
        const uppercased = filter.value.toUpperCase().trim();
        filter.value = uppercased === "SPAN" ? "'DEFAULT'" : `'${uppercased}'`;
        filter.castType = "span_type";
      } else if (filter.column === "model") {
        filter.column = "COALESCE(attributes ->> 'gen_ai.response.model', attributes ->> 'gen_ai.request.model')";
      }
      return filter;
    });

  const sqlFilters = filtersToSql(
    urlParamFilters,
    [new RegExp(/^\(attributes\s*->>\s*'[a-zA-Z_\.]+'\)(?:::int8|::float8)?$/)],
    {
      latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`,
      path: sql<string>`attributes ->> 'lmnr.span.path'`,
    }
  );

  const baseFilters = [
    inArray(sql`trace_id`, db.select({ id: traces.id }).from(traces).where(eq(traces.traceType, "DEFAULT"))),
    sql`project_id = ${projectId}`,
  ];

  const filters = getDateRangeFilters(startTime, endTime, pastHours).concat(
    sqlFilters,
    labelFilters,
    textSearchFilters
  );
  // don't query input and output, only query previews
  const { input, output, ...columns } = getTableColumns(spans);

  const spanData = await paginatedGet<any, Span>({
    table: spans,
    pageNumber,
    pageSize,
    filters: baseFilters.concat(filters),
    orderBy: desc(spans.startTime),
    columns: {
      ...columns,
      latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`.as("latency"),
      path: sql<string>`attributes ->> 'lmnr.span.path'`.as("path"),
      model: sql<string>`COALESCE(attributes ->> 'gen_ai.response.model', attributes ->> 'gen_ai.request.model')`.as(
        "model"
      ),
    },
  });

  return new Response(JSON.stringify(spanData), { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const { searchParams } = new URL(req.url);
  const spanId = searchParams.get("spanId")?.split(",");

  if (!spanId) {
    return new Response("At least one Span ID is required", { status: 400 });
  }

  try {
    await db.delete(spans).where(and(inArray(spans.spanId, spanId), eq(spans.projectId, projectId)));

    return new Response("Spans deleted successfully", { status: 200 });
  } catch (error) {
    return new Response("Error deleting spans", { status: 500 });
  }
}
