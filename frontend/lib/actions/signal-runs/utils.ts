import { type Filter } from "@/lib/actions/common/filters";
import {
  buildSelectQuery,
  type ColumnFilterConfig,
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
  "error_message errorMessage"
];

export const signalRunsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["job_id", createStringFilter],
    ["run_id", createStringFilter],
    ["trace_id", createStringFilter],
    ["trigger_id", createStringFilter],
    ["event_id", createStringFilter],
    ["status", createStringFilter],
    ["error_message", createStringFilter],
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
