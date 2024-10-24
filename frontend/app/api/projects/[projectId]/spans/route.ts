import { db } from '@/lib/db/drizzle';
import { FilterDef, filtersToSql } from '@/lib/db/modifiers';
import { spans, traces } from '@/lib/db/schema';
import { getDateRangeFilters, isCurrentUserMemberOfProject, paginatedGet } from '@/lib/db/utils';
import { Span } from '@/lib/traces/types';
import { and, desc, eq, getTableColumns, inArray, sql} from 'drizzle-orm';
import { NextRequest } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  if (!await isCurrentUserMemberOfProject(projectId)) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

  const pastHours = req.nextUrl.searchParams.get("pastHours");
  const startTime = req.nextUrl.searchParams.get("startDate");
  const endTime = req.nextUrl.searchParams.get("endDate");
  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;

  let urlParamFilters: FilterDef[] = [];
  try {
    urlParamFilters = JSON.parse(req.nextUrl.searchParams.get('filter') ?? '[]') as FilterDef[];
  } catch (e) {
    urlParamFilters = [];
  }
  if (!Array.isArray(urlParamFilters)) {
    urlParamFilters = [];
  }

  urlParamFilters = urlParamFilters.map(filter => {
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
    }
    return filter;
  });

  const sqlFilters = filtersToSql(
    urlParamFilters,
    [new RegExp(/^\(attributes\s*->>\s*'[a-zA-Z_\.]+'\)(?:::int8|::float8)?$/)]
  );

  const baseFilters = [
    inArray(
      sql`trace_id`,
      db
        .select({ id: traces.id })
        .from(traces)
        .where(and(
          eq(traces.traceType, "DEFAULT"),
          eq(traces.projectId, projectId)
        ))
    ),
  ];

  const filters = getDateRangeFilters(startTime, endTime, pastHours).concat(sqlFilters);
  // don't query input and output, only query previews
  const { input, output, ...columns } = getTableColumns(spans);

  const baseQuery = db.$with(
    "base",
  ).as(
    db
      .select({
        ...columns,
        latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`.as("latency"),
        path: sql<string>`attributes ->> 'lmnr.span.path'`.as("path"),
      })
      .from(spans)
      .where(and(...baseFilters))
  );

  const spanData = await paginatedGet<any, Span>({
    table: spans,
    pageNumber,
    pageSize,
    baseFilters,
    filters,
    orderBy: desc(sql`start_time`),
    baseQuery,
  });

  return new Response(JSON.stringify(spanData), { status: 200 });
}
