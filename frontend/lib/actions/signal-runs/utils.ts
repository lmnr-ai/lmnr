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

const signalRunsSelectColumns = [
  "job_id jobId",
  "run_id runId",
  "trace_id traceId",
  "trigger_id triggerId",
  "formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') as updatedAt",
  "status",
  "event_id eventId",
  "input_tokens inputTokens",
  "cache_read_tokens cacheReadTokens",
  "output_tokens outputTokens",
];

const NIL_EVENT_ID = "00000000-0000-0000-0000-000000000000";

// Virtual column: Has event Yes/No in the picker, an `event_id` nil-check in SQL (`ne` inverts the choice).
const createHasEventFilter = createCustomFilter(
  (filter, paramKey) => {
    const wantsEvent = String(filter.value) === "event";
    const hasEvent = wantsEvent === (filter.operator !== "ne");
    return hasEvent ? `event_id != {${paramKey}:UUID}` : `event_id = {${paramKey}:UUID}`;
  },
  (_filter, paramKey) => ({ [paramKey]: NIL_EVENT_ID })
);

export const signalRunsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["job_id", createStringFilter],
    ["run_id", createStringFilter],
    ["trace_id", createStringFilter],
    ["trigger_id", createStringFilter],
    ["event_id", createStringFilter],
    ["has_event", createHasEventFilter],
    ["status", createStringFilter],
  ]),
};

export interface BuildSignalRunsQueryOptions {
  signalId: string;
  filters: Filter[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

export const buildSignalRunsQueryWithParams = (options: BuildSignalRunsQueryOptions): QueryResult => {
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
      columns: signalRunsSelectColumns,
      table: "signal_runs",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "updated_at",
    },
    filters,
    columnFilterConfig: signalRunsColumnFilterConfig,
    customConditions,
    orderBy: [
      {
        column: "updated_at",
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
