import { and, eq } from "drizzle-orm";
import { compact, keyBy } from "lodash";

import { Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import {
  buildSelectQuery,
  ColumnFilterConfig,
  createCustomFilter,
  createStringFilter,
  QueryParams,
  QueryResult,
  SelectQueryOptions,
} from "@/lib/actions/common/query-builder";
import { db } from "@/lib/db/drizzle";
import { eventClusters } from "@/lib/db/migrations/schema";

export const eventsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["id", createStringFilter],
    ["user_id", createStringFilter],
    ["session_id", createStringFilter],
    [
      "cluster",
      createCustomFilter(
        (filter, paramKey) => {
          if (filter.operator === Operator.Eq) {
            return `has(clusters, {${paramKey}:UUID})`;
          } else {
            return `NOT has(clusters, {${paramKey}:UUID})`;
          }
        },
        (filter, paramKey) => ({ [paramKey]: filter.value })
      ),
    ],
    [
      "attributes",
      createCustomFilter(
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return `simpleJSONExtractRaw(attributes, {${paramKey}_key:String}) = {${paramKey}_val:String}`;
          }
          return "";
        },
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return {
              [`${paramKey}_key`]: key,
              [`${paramKey}_val`]: `"${val}"`,
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
  "span_id spanId",
  "trace_id traceId",
  "formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp",
  "name",
  "attributes",
  "user_id userId",
  "session_id sessionId",
];

export interface BuildEventsQueryOptions {
  eventName: string;
  filters: Filter[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  eventSource?: "CODE" | "SEMANTIC";
}

export const buildEventsQueryWithParams = (options: BuildEventsQueryOptions): QueryResult => {
  const { eventName, filters, limit, offset, startTime, endTime, pastHours, eventSource } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "name = {eventName:String}",
      params: { eventName },
    },
  ];

  if (eventSource) {
    customConditions.push({
      condition: "source = {eventSource:String}",
      params: { eventSource },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: eventsSelectColumns,
      table: "events",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "events.timestamp",
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
  const { eventName, filters, startTime, endTime, pastHours, eventSource } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "name = {eventName:String}",
      params: { eventName },
    },
  ];

  if (eventSource) {
    customConditions.push({
      condition: "source = {eventSource:String}",
      params: { eventSource },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["COUNT(*) as count"],
      table: "events",
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
  eventName?: string;
}

export async function resolveClusterFilters({
  filters,
  projectId,
  eventName,
}: ResolveClusterFiltersOptions): Promise<Filter[]> {
  const hasClusterFilter = filters.some((f) => f.column === "cluster");
  if (!hasClusterFilter) {
    return filters;
  }

  const conditions = [eq(eventClusters.projectId, projectId)];
  if (eventName) {
    conditions.push(eq(eventClusters.eventName, eventName));
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
