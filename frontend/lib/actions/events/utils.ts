import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter } from "@/lib/actions/common/filters";
import {
  buildSelectQuery,
  type ColumnFilterConfig,
  createStringFilter,
  type QueryParams,
  type QueryResult,
  type SelectQueryOptions,
} from "@/lib/actions/common/query-builder";

export const eventsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["id", createStringFilter],
    ["trace_id", createStringFilter],
    ["run_id", createStringFilter],
    [
      "severity",
      (filter, paramKey) => {
        const opSymbol = OperatorLabelMap[filter.operator];
        return {
          condition: `severity ${opSymbol} {${paramKey}:UInt8}`,
          params: { [paramKey]: parseInt(String(filter.value), 10) },
        };
      },
    ],
  ]),
  defaultProcessor: (filter, paramKey) => {
    const { column, value, dataType } = filter;
    const fieldName = column.startsWith("payload.") ? column.slice("payload.".length) : column;
    const opSymbol = OperatorLabelMap[filter.operator];

    if (dataType === "number") {
      const numValue = parseFloat(String(value));
      return {
        condition: `(simpleJSONExtractFloat(payload, {${paramKey}_key:String}) ${opSymbol} {${paramKey}_val:Float64})`,
        params: {
          [`${paramKey}_key`]: fieldName,
          [`${paramKey}_val`]: numValue,
        },
      };
    }

    if (dataType === "boolean") {
      const boolStr = String(value) === "true" ? "true" : "false";
      return {
        condition: `(simpleJSONExtractBool(payload, {${paramKey}_key:String}) ${opSymbol} {${paramKey}_val:Bool})`,
        params: {
          [`${paramKey}_key`]: fieldName,
          [`${paramKey}_val`]: boolStr,
        },
      };
    }

    return {
      condition:
        `(simpleJSONExtractString(payload, {${paramKey}_key:String}) ${opSymbol} {${paramKey}_val:String}` +
        ` OR simpleJSONExtractRaw(payload, {${paramKey}_key:String}) ${opSymbol} {${paramKey}_val:String})`,
      params: {
        [`${paramKey}_key`]: fieldName,
        [`${paramKey}_val`]: String(value),
      },
    };
  },
};

const eventsSelectColumns = [
  "id",
  "signal_id signalId",
  "trace_id traceId",
  "formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp",
  "payload",
  "severity",
];

export interface BuildEventsQueryOptions {
  signalId: string;
  filters: Filter[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  clusterFilter?: "unclustered" | string[];
  // "signal_events_all" is used for the "emerging cluster" that includes L0 clusters
  table?: "signal_events" | "signal_events_all";
}

function buildClusterConditions(
  clusterFilter: "unclustered" | string[] | undefined
): Array<{ condition: string; params: QueryParams }> {
  if (!clusterFilter) return [];

  if (clusterFilter === "unclustered") {
    return [{ condition: "empty(clusters)", params: {} }];
  }

  return [
    {
      condition: "hasAny(clusters, {clusterIds:Array(UUID)})",
      params: { clusterIds: clusterFilter },
    },
  ];
}

export const buildEventsQueryWithParams = (options: BuildEventsQueryOptions): QueryResult => {
  const { signalId, filters, limit, offset, startTime, endTime, pastHours, clusterFilter, table } = options;

  const tableName = table ?? "signal_events";

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
    ...buildClusterConditions(clusterFilter),
  ];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: eventsSelectColumns,
      table: tableName,
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      // Qualify with the table alias so we don't collide with the
      // `formatDateTime(timestamp, ...) AS timestamp` SELECT alias — ClickHouse
      // resolves unqualified WHERE column refs to SELECT aliases, which would
      // produce a String vs DateTime type error.
      timeColumn: `${tableName}.timestamp`,
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
  const { signalId, filters, startTime, endTime, pastHours, clusterFilter, table } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
    ...buildClusterConditions(clusterFilter),
  ];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["COUNT(*) as count"],
      table: table ?? "signal_events",
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
