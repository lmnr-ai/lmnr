import { and, desc, eq, getTableColumns, inArray, not, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { getDateRangeFilters, paginatedGet } from "@/lib/db/utils";
import { Span } from "@/lib/traces/types";
import { createModelFilter } from "@/lib/traces/utils";

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

    case "total_token_count":
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
      return { ...filter, value: newValue, castType: "span_type" };
    }

    default:
      return filter;
  }
};

const createLabelFilters = (filters: FilterDef[]) =>
  filters
    .filter((filter) => filter.column === "tags" && ["eq", "ne"].includes(filter.operator))
    .map((filter) => {
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
    });

const partitionFilters = (filters: FilterDef[]) =>
  filters.reduce(
    (acc, filter) => {
      if (filter.column === "tags") acc.tags.push(filter);
      else if (filter.column === "model") acc.model.push(filter);
      else acc.other.push(filter);
      return acc;
    },
    { tags: [], model: [], other: [] } as Record<"tags" | "model" | "other", FilterDef[]>
  );

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
    urlParamFilters = req.nextUrl.searchParams.getAll("filter").map((f) => {
      const urlParamFilter = JSON.parse(f) as FilterDef;
      return {
        column: urlParamFilter.column,
        operator: urlParamFilter.operator,
        value: urlParamFilter.value,
      };
    });
  } catch (e) {
    urlParamFilters = [];
  }
  if (!Array.isArray(urlParamFilters)) {
    urlParamFilters = [];
  }

  const { tags: tagFilters, model: modelFilters, other: otherFilters } = partitionFilters(urlParamFilters);

  const labelSqlFilters = createLabelFilters(tagFilters);
  const modelSqlFilters = modelFilters.map(createModelFilter);
  const processedOtherFilters = otherFilters.map(processAttributeFilter);

  const otherSqlFilters = filtersToSql(
    processedOtherFilters,
    [new RegExp(/^\(attributes\s*->>\s*'[a-zA-Z_\.]+'\)(?:::int8|::float8)?$/)],
    {
      latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`,
      path: sql<string>`attributes ->> 'lmnr.span.path'`,
    }
  );

  let searchSpanIds = null;
  if (req.nextUrl.searchParams.get("search")) {
    const searchType = req.nextUrl.searchParams.getAll("searchIn");
    const timeRange = getTimeRange(pastHours ?? undefined, startTime ?? undefined, endTime ?? undefined);
    const searchResult = await searchSpans({
      projectId,
      searchQuery: req.nextUrl.searchParams.get("search") ?? "",
      timeRange,
      searchType: searchType as SpanSearchType[],
    });
    searchSpanIds = Array.from(searchResult.spanIds);
  }

  const textSearchFilters = searchSpanIds ? [inArray(sql`span_id`, searchSpanIds)] : [];

  const baseFilters = [
    inArray(
      sql`trace_id`,
      db
        .select({ id: traces.id })
        .from(traces)
        .where(and(eq(traces.traceType, "DEFAULT"), eq(traces.projectId, projectId)))
    ),
    sql`project_id = ${projectId}`,
  ];

  // Combine all SQL filters
  const allSqlFilters = [
    ...getDateRangeFilters(startTime, endTime, pastHours),
    ...otherSqlFilters,
    ...modelSqlFilters,
    ...labelSqlFilters,
    ...textSearchFilters,
  ];

  const { input, output, ...columns } = getTableColumns(spans);

  const spanData = await paginatedGet<any, Span>({
    table: spans,
    pageNumber,
    pageSize,
    filters: [...baseFilters, ...allSqlFilters], // Now all are SQL filters
    orderBy: [desc(spans.startTime)],
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
