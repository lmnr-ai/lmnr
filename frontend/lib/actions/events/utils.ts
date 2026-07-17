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
  /** Restrict to events whose trace matches an agent version (or the unversioned bucket). */
  versionFilter?: VersionFilter;
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

/** null versionHashes = the "unversioned" agent bucket (trace has no version_hash). */
export interface VersionFilter {
  versionHashes: string[] | null;
}

// Filter events to those whose trace resolves to a given agent version, via a
// subquery on `traces.metadata.version_hash`. The subquery's own `start_time`
// bound lets the query-engine validator prune `traces_v0` (smoke-tested LAM).
// Prototype note: bounding traces to the event window makes long-running traces
// (started before the window) fall out — same tradeoff as the agent stats query.
function buildVersionConditions(
  versionFilter: VersionFilter | undefined,
  bounds: { startTime?: string; endTime?: string; pastHours?: string }
): Array<{ condition: string; params: QueryParams }> {
  if (!versionFilter) return [];
  const { versionHashes } = versionFilter;
  // An agent with zero versions can never match.
  if (versionHashes && versionHashes.length === 0) return [{ condition: "1 = 0", params: {} }];

  const traceConds: string[] = [];
  const params: QueryParams = {};
  if (bounds.pastHours && !isNaN(parseFloat(bounds.pastHours))) {
    traceConds.push("start_time >= now() - INTERVAL {vhPastHours:UInt32} HOUR");
    params.vhPastHours = parseInt(bounds.pastHours);
  } else {
    if (bounds.startTime) {
      traceConds.push("start_time >= {vhStartTime:String}");
      params.vhStartTime = bounds.startTime.replace("Z", "");
    }
    if (bounds.endTime) {
      traceConds.push("start_time <= {vhEndTime:String}");
      params.vhEndTime = bounds.endTime.replace("Z", "");
    }
  }

  if (versionHashes === null) {
    traceConds.push("simpleJSONExtractString(metadata, 'version_hash') = ''");
  } else {
    traceConds.push("simpleJSONExtractString(metadata, 'version_hash') IN {versionHashes:Array(String)}");
    params.versionHashes = versionHashes;
  }

  return [
    {
      condition: `trace_id IN (SELECT id FROM traces WHERE ${traceConds.join(" AND ")})`,
      params,
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
    versionFilter,
    idFilter,
    table,
    sortBy,
    sortDirection,
    sortType,
  } = options;

  const tableName = table ?? "signal_events";

  const sortColumn = sortBy ? resolveEventsSortColumn(sortBy, sortType) : null;
  // Order by the chosen column, then always fall back to `timestamp DESC` as a
  // tiebreaker so offset pagination is stable on low-cardinality sorts (e.g. the
  // 3-value severity enum): `signal_events` is a plain MergeTree, so without a
  // secondary key ClickHouse may reorder ties between page fetches and duplicate
  // / skip rows.
  const orderBy: Array<{ column: string; direction: "ASC" | "DESC" }> = [];
  if (sortColumn && sortColumn !== "timestamp") {
    orderBy.push({ column: sortColumn, direction: sortDirection ?? "DESC" });
  }
  orderBy.push({ column: "timestamp", direction: sortColumn === "timestamp" ? (sortDirection ?? "DESC") : "DESC" });

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
    ...buildClusterConditions(clusterFilter),
    ...buildVersionConditions(versionFilter, { startTime, endTime, pastHours }),
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
  const { signalId, filters, startTime, endTime, pastHours, clusterFilter, versionFilter, idFilter, table } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
    ...buildClusterConditions(clusterFilter),
    ...buildVersionConditions(versionFilter, { startTime, endTime, pastHours }),
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
