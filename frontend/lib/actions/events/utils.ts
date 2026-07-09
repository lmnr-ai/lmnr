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

/** Data type of a payload field being sorted on; drives the JSONExtract cast. */
export type EventSortType = "number" | "boolean" | "string";

// Payload field names are interpolated directly into the ORDER BY JSONExtract
// call (params can't bind ORDER BY expressions cleanly), so the field name is
// the SQL-injection boundary. This mirrors `search_signal_events` in
// `app-server/src/search/signal_events.rs`: only strict identifiers pass, and
// anything else silently drops back to the default timestamp ordering.
const PAYLOAD_SORT_FIELD_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Resolve a sortable column id into a safe ClickHouse ORDER BY expression.
 * Returns null for unknown / unsafe columns so the caller can fall back to the
 * default ordering.
 */
const resolveEventsSortColumn = (sortBy: string, sortType?: EventSortType): string | null => {
  if (sortBy === "timestamp" || sortBy === "severity") {
    return sortBy;
  }

  if (sortBy.startsWith("payload:")) {
    const fieldName = sortBy.slice("payload:".length);
    if (!PAYLOAD_SORT_FIELD_RE.test(fieldName)) {
      return null;
    }

    switch (sortType) {
      case "number":
        return `simpleJSONExtractFloat(payload, '${fieldName}')`;
      case "boolean":
        return `simpleJSONExtractBool(payload, '${fieldName}')`;
      default:
        return `simpleJSONExtractString(payload, '${fieldName}')`;
    }
  }

  return null;
};

export interface BuildEventsQueryOptions {
  signalId: string;
  filters: Filter[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  clusterFilter?: "unclustered" | string[];
  /** Restrict results to this set of event ids (used for full-text search hydration). */
  idFilter?: string[];
  // "signal_events_all" is used for the "emerging cluster" that includes L0 clusters
  table?: "signal_events" | "signal_events_all";
  /** Column id to sort on ("timestamp" | "severity" | "payload:<field>"). */
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
  /** Data type of the payload field being sorted on (ignored for native columns). */
  sortType?: EventSortType;
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

function buildIdFilterConditions(idFilter: string[] | undefined): Array<{ condition: string; params: QueryParams }> {
  if (!idFilter) return [];
  return [
    {
      condition: "id IN {ids:Array(UUID)}",
      params: { ids: idFilter },
    },
  ];
}

export const buildEventsQueryWithParams = (options: BuildEventsQueryOptions): QueryResult => {
  const {
    signalId,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    clusterFilter,
    idFilter,
    table,
    sortBy,
    sortDirection,
    sortType,
  } = options;

  const tableName = table ?? "signal_events";

  const sortColumn = sortBy ? resolveEventsSortColumn(sortBy, sortType) : null;
  const orderBy = sortColumn
    ? [{ column: sortColumn, direction: sortDirection ?? "DESC" }]
    : [{ column: "timestamp", direction: "DESC" as const }];

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
    ...buildClusterConditions(clusterFilter),
    ...buildIdFilterConditions(idFilter),
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
    orderBy,
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
  const { signalId, filters, startTime, endTime, pastHours, clusterFilter, idFilter, table } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
    ...buildClusterConditions(clusterFilter),
    ...buildIdFilterConditions(idFilter),
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
