import { and, desc, eq, ne } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { FiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { searchSpans } from "@/lib/actions/traces/search";
import { buildTracesIdsQueryWithParams, DEFAULT_SEARCH_MAX_HITS } from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { signalJobs } from "@/lib/db/migrations/schema";
import { fetcherJSON } from "@/lib/utils";

export const GetSignalJobsSchema = z.object({
  projectId: z.string(),
  signalId: z.string().optional(),
  ...FiltersSchema.shape,
});

export async function getSignalJobs(input: z.infer<typeof GetSignalJobsSchema>) {
  const { projectId, signalId, filter } = input;

  const filters = compact(filter);

  const whereConditions = [
    eq(signalJobs.projectId, projectId),
    ...(signalId ? [eq(signalJobs.signalId, signalId)] : []),
  ];

  for (const f of filters) {
    if (f.column === "job_id") {
      if (f.operator === Operator.Eq) {
        whereConditions.push(eq(signalJobs.id, String(f.value)));
      } else if (f.operator === Operator.Ne) {
        whereConditions.push(ne(signalJobs.id, String(f.value)));
      }
    }
  }

  const jobs = await db
    .select()
    .from(signalJobs)
    .where(and(...whereConditions))
    .orderBy(desc(signalJobs.updatedAt), desc(signalJobs.createdAt));

  return {
    items: jobs,
  };
}

export const CreateSignalJob = z.object({
  projectId: z.string(),
  signalId: z.string(),
  search: z.string().nullable().optional(),
  traceIds: z.array(z.string()).optional(),
  ...FiltersSchema.shape,
  ...TimeRangeSchema.shape,
});

const getTraceSelection = (
  selectedTraceIds: string[] | undefined,
  search: string | null | undefined,
  traceIdsFromSearch: string[]
): { traceIds: string[] | undefined; limit: number | undefined } => {
  if (selectedTraceIds && selectedTraceIds.length > 0) {
    return { traceIds: selectedTraceIds, limit: selectedTraceIds.length };
  }

  if (search && traceIdsFromSearch.length > 0) {
    return { traceIds: traceIdsFromSearch, limit: DEFAULT_SEARCH_MAX_HITS };
  }

  return { traceIds: undefined, limit: undefined };
};

export async function createSignalJob(
  input: z.infer<typeof CreateSignalJob>
): Promise<{ success: boolean; message: string }> {
  const {
    projectId,
    signalId,
    filter: inputFilters,
    search,
    pastHours,
    startDate,
    endDate,
    traceIds: selectedTraceIds,
  } = CreateSignalJob.parse(input);

  const filters: Filter[] = compact(inputFilters);

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
      projectId,
      traceId: undefined,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startDate, endDate),
      searchType: [] as SpanSearchType[],
    })
    : [];
  const traceIdsFromSearch = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search && traceIdsFromSearch.length === 0) {
    throw new Error("No traces match your search criteria.");
  }

  const { traceIds, limit } = getTraceSelection(selectedTraceIds, search, traceIdsFromSearch);

  const { query: sqlQuery, parameters } = buildTracesIdsQueryWithParams({
    traceType: "DEFAULT",
    filters,
    limit,
    traceIds,
    startTime: startDate,
    endTime: endDate,
    pastHours,
  });

  const response = await fetcherJSON<{ success: boolean; message: string }>(`/projects/${projectId}/signal-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: sqlQuery,
      parameters,
      signalId,
    }),
  });

  return response;
}
