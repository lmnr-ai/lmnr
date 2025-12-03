import { eq } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { Filter } from "@/lib/actions/common/filters";
import { buildTimeRangeWithFill, buildWhereClause, QueryParams } from "@/lib/actions/common/query-builder";
import { FiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { eventsColumnFilterConfig } from "@/lib/actions/events/utils";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { eventClusters } from "@/lib/db/migrations/schema";

export const GetEventStatsSchema = z.object({
  ...FiltersSchema.shape,
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  eventName: z.string(),
  eventDefinitionId: z.string().optional(),
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

export interface EventsStatsDataPoint {
  timestamp: string;
  count: number;
}

export async function getEventStats(
  input: z.infer<typeof GetEventStatsSchema>
): Promise<{ items: EventsStatsDataPoint[] }> {
  const {
    projectId,
    eventName,
    eventDefinitionId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    intervalValue,
    intervalUnit,
    filter,
  } = input;

  const filters = compact(filter);

  // Resolve cluster names to cluster IDs (lazy - only if cluster filters exist)
  let processedFilters = filters;

  const hasClusterFilter = filters.some((f) => f.column === "cluster");
  if (hasClusterFilter && eventDefinitionId) {
    const clustersList = await db
      .select()
      .from(eventClusters)
      .where(eq(eventClusters.eventDefinitionId, eventDefinitionId));

    // Replace cluster names with cluster IDs, remove filters for non-existent clusters
    processedFilters = filters
      .map((filter) => {
        if (filter.column === "cluster") {
          const cluster = clustersList.find((c) => c.name === filter.value);
          if (cluster) {
            return { ...filter, value: cluster.id };
          } else {
            // Cluster doesn't exist - log warning and filter it out
            console.warn(`Cluster "${filter.value}" not found in event clusters for event definition ${eventDefinitionId}`);
            return null;
          }
        }
        return filter;
      })
      .filter((f): f is Filter => f !== null);
  }

  // Build WHERE clause using the query builder for consistency with events table
  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "name = {eventName:String}",
      params: { eventName },
    },
  ];

  const whereResult = buildWhereClause({
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "timestamp",
    },
    filters: processedFilters,
    columnFilterConfig: eventsColumnFilterConfig,
    customConditions,
  });

  const { fillFrom, fillTo } = buildTimeRangeWithFill({
    startTime,
    endTime,
    pastHours,
    timeColumn: "timestamp",
    intervalValue,
    intervalUnit,
  });

  const withFillClause =
    fillFrom && fillTo
      ? `WITH FILL
    FROM ${fillFrom}
    TO ${fillTo}
    STEP toInterval({intervalValue:UInt32}, {intervalUnit:String})`
      : "";

  const query = `
    SELECT 
      toStartOfInterval(timestamp, toInterval({intervalValue:UInt32}, {intervalUnit:String})) as timestamp,
      count() as count
    FROM events
    ${whereResult.query}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<EventsStatsDataPoint>({
    query,
    parameters: {
      ...whereResult.parameters,
      intervalValue,
      intervalUnit,
    },
    projectId,
  });

  return { items };
}
