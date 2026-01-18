import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { buildTracesCountQueryWithParams, buildTracesIdsQueryWithParams } from "@/lib/actions/traces/utils";
import { fetcherJSON } from "@/lib/utils";

export const GetTraceIdsForBackfillSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
});

export const TriggerSemanticEventBackfillSchema = z.object({
  projectId: z.string(),
  eventDefinitionId: z.string(),
  traceIds: z.array(z.string()).min(1, "At least one trace ID is required"),
});

export const GetTraceCountForBackfillSchema = z.object({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  filter: z
    .array(z.string())
    .default([])
    .transform((filters) =>
      filters
        .map((filter) => {
          try {
            return JSON.parse(filter) as Filter;
          } catch {
            return undefined;
          }
        })
        .filter((f): f is Filter => f !== undefined)
    ),
});

const MAX_TRACE_IDS = 10000;

export async function getTraceIdsForBackfill(
  input: z.infer<typeof GetTraceIdsForBackfillSchema>
): Promise<{ traceIds: string[]; totalCount: number }> {
  const { projectId, pastHours, startDate: startTime, endDate: endTime, filter: inputFilters } = input;

  const filters: Filter[] = compact(inputFilters);

  const { query, parameters } = buildTracesIdsQueryWithParams({
    traceType: "DEFAULT",
    filters,
    limit: MAX_TRACE_IDS,
    startTime,
    endTime,
    pastHours,
  });

  const items = await executeQuery<{ id: string }>({
    query,
    parameters,
    projectId,
  });

  return {
    traceIds: items.map((item) => item.id),
    totalCount: items.length,
  };
}

export async function getTraceCountForBackfill(
  input: z.infer<typeof GetTraceCountForBackfillSchema>
): Promise<{ count: number }> {
  const { projectId, pastHours, startDate: startTime, endDate: endTime, filter: filters } = input;

  const { query, parameters } = buildTracesCountQueryWithParams({
    traceType: "DEFAULT",
    filters,
    startTime,
    endTime,
    pastHours,
  });

  const [result] = await executeQuery<{ count: number }>({
    query,
    parameters,
    projectId,
  });

  return { count: Number(result?.count ?? 0) };
}

export async function triggerSemanticEventBackfill(
  input: z.infer<typeof TriggerSemanticEventBackfillSchema>
): Promise<{ success: boolean; message: string }> {
  const { projectId, eventDefinitionId, traceIds } = TriggerSemanticEventBackfillSchema.parse(input);

  // TODO: Replace with actual app-server endpoint URL
  const response = await fetcherJSON<{ success: boolean; message: string }>(
    `/projects/${projectId}/semantic-event-definitions/${eventDefinitionId}/backfill`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ traceIds }),
    }
  );

  return response;
}
