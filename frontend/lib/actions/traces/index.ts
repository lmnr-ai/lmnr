import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { buildTracesQueryWithParams, searchSpans } from "@/lib/actions/traces/utils";
import { clickhouseClient } from "@/lib/clickhouse/client.ts";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { FilterDef } from "@/lib/db/modifiers";
import { TraceRow } from "@/lib/traces/types.ts";

const TRACES_TRACE_VIEW_WIDTH = "traces-trace-view-width";
const EVENTS_TRACE_VIEW_WIDTH = "events-trace-view-width";

export const GetTracesSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  traceType: z
    .enum(["DEFAULT", "EVALUATION", "EVENT", "PLAYGROUND"])
    .nullable()
    .optional()
    .transform((val) => val || "DEFAULT"),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export const DeleteTracesSchema = z.object({
  projectId: z.string(),
  traceIds: z.array(z.string()).min(1),
});

export async function getTraces(input: z.infer<typeof GetTracesSchema>): Promise<{ items: TraceRow[] }> {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    traceType,
    search,
    searchIn,
    filter: inputFilters,
  } = input;

  const filters: FilterDef[] = compact(inputFilters);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const traceIds = search
    ? await searchSpans({
      projectId,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
    })
    : [];

  if (search && traceIds?.length === 0) {
    return { items: [] };
  }

  const { query: mainQuery, parameters: mainParams } = buildTracesQueryWithParams({
    projectId,
    traceType,
    traceIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
  });

  const items = await executeQuery<TraceRow>({ query: mainQuery, parameters: mainParams, projectId });

  return {
    items,
  };
}

export async function deleteTraces(input: z.infer<typeof DeleteTracesSchema>) {
  const { projectId, traceIds } = input;

  await clickhouseClient.command({
    query: `
        DELETE FROM spans
        WHERE project_id = {projectId: UUID} 
            AND trace_id in ({traceIds: Array(UUID)})
      `,
    query_params: {
      traceIds,
      projectId,
    },
  });
}

export { EVENTS_TRACE_VIEW_WIDTH, TRACES_TRACE_VIEW_WIDTH };
