import { and, eq } from "drizzle-orm";
import { compact, keyBy } from "lodash";

import { type Filter } from "@/lib/actions/common/filters";
import {
  buildSelectQuery,
  type ColumnFilterConfig,
  createCustomFilter,
  createStringFilter,
  type QueryParams,
  type QueryResult,
  type SelectQueryOptions,
} from "@/lib/actions/common/query-builder";
import { db } from "@/lib/db/drizzle";
import { eventClusters } from "@/lib/db/migrations/schema";

export const eventsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["id", createStringFilter],
    ["trace_id", createStringFilter],
    ["run_id", createStringFilter],
    [
      "payload",
      createCustomFilter(
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return (
              `(simpleJSONExtractString(payload, {${paramKey}_key:String}) = {${paramKey}_val:String}` +
              ` OR simpleJSONExtractRaw(payload, {${paramKey}_key:String}) = {${paramKey}_val:String})`
            );
          }
          return "";
        },
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return {
              [`${paramKey}_key`]: key,
              [`${paramKey}_val`]: `${val}`,
            };
          }
          return {};
        }
      ),
    ],
  ]),
};

const eventsSelectColumns = [
  "id",
  "signal_id signalId",
  "trace_id traceId",
  "formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp",
  "payload",
];

export interface BuildEventsQueryOptions {
  signalId: string;
  filters: Filter[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

export const buildEventsQueryWithParams = (options: BuildEventsQueryOptions): QueryResult => {
  const { signalId, filters, limit, offset, startTime, endTime, pastHours } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
  ];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: eventsSelectColumns,
      table: "signal_events",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "signal_events.timestamp",
    },
    filters,
    columnFilterConfig: eventsColumnFilterConfig,
    customConditions,
    orderBy: [
      {
        column: "timestamp",
        direction: "DESC",
      },
    ],
    pagination: {
      limit,
      offset,
    },
  };

  return buildSelectQuery(queryOptions);
};

export const buildEventsCountQueryWithParams = (
  options: Omit<BuildEventsQueryOptions, "limit" | "offset">
): QueryResult => {
  const { signalId, filters, startTime, endTime, pastHours } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
  ];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["COUNT(*) as count"],
      table: "signal_events",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "timestamp",
    },
    filters,
    columnFilterConfig: eventsColumnFilterConfig,
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};

export interface ResolveClusterFiltersOptions {
  filters: Filter[];
  projectId: string;
  signalId?: string;
}

export async function resolveClusterFilters({
  filters,
  projectId,
  signalId,
}: ResolveClusterFiltersOptions): Promise<Filter[]> {
  const hasClusterFilter = filters.some((f) => f.column === "cluster");
  if (!hasClusterFilter) {
    return filters;
  }

  const conditions = [eq(eventClusters.projectId, projectId)];
  if (signalId) {
    conditions.push(eq(eventClusters.eventName, signalId));
  }

  const clustersList = await db
    .select()
    .from(eventClusters)
    .where(and(...conditions));

  const clustersByName = keyBy(clustersList, "name");

  return compact(
    filters.map((filter) => {
      if (filter.column !== "cluster") {
        return filter;
      }
      const cluster = clustersByName[String(filter.value)];
      return cluster ? { ...filter, value: cluster.id } : null;
    })
  );
}
