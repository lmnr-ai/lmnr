import { clickhouseClient } from "@/lib/clickhouse/client";

import { GroupByInterval, truncateTimeMap } from "./modifiers";
import { MetricTimeValue } from "./types";
import {
  addTimeRangeToQuery,
  getTimeBounds,
  groupByTimeAbsoluteStatement,
  groupByTimeRelativeStatement,
  TimeRange,
} from "./utils";

export interface DatapointSearchParams {
  projectId: string;
  datasetId?: string;
  datasetName?: string;
  searchQuery?: string;
  timeRange: TimeRange;
  pageSize?: number;
  offset?: number;
}

export interface DatapointResult {
  id: string;
  dataset_id: string;
  dataset_name: string;
  project_id: string;
  created_at: string;
  data: string;
  target: string;
  metadata: string;
}

export interface DatapointMetricsParams {
  projectId: string;
  datasetId?: string;
  datasetName?: string;
  groupByInterval: GroupByInterval;
  timeRange: TimeRange;
}

export const getDatapoints = async (params: DatapointSearchParams): Promise<DatapointResult[]> => {
  const { projectId, datasetId, datasetName, searchQuery, timeRange, pageSize = 50, offset = 0 } = params;

  let baseQuery = `
    SELECT 
      id,
      dataset_id,
      dataset_name,
      project_id,
      created_at,
      data,
      target,
      metadata
    FROM datapoints
    WHERE project_id = {projectId: UUID}
  `;

  // Add dataset filters
  if (datasetId) {
    baseQuery += ` AND dataset_id = {datasetId: UUID}`;
  }

  if (datasetName) {
    baseQuery += ` AND dataset_name = {datasetName: String}`;
  }

  // Add search functionality
  if (searchQuery) {
    baseQuery += ` AND (data LIKE {searchQuery: String} OR target LIKE {searchQuery: String})`;
  }

  const query = addTimeRangeToQuery(baseQuery, timeRange, "created_at");

  const finalQuery = `${query} 
    ORDER BY created_at DESC 
    LIMIT {pageSize: UInt32} 
    OFFSET {offset: UInt32}`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: "JSONEachRow",
    query_params: {
      projectId,
      datasetId,
      datasetName,
      searchQuery: searchQuery ? `%${searchQuery}%` : undefined,
      pageSize,
      offset,
    },
  });

  return await result.json();
};

export const getDatapointCount = async (params: Omit<DatapointSearchParams, 'pageSize' | 'offset'>): Promise<number> => {
  const { projectId, datasetId, datasetName, searchQuery, timeRange } = params;

  let baseQuery = `
    SELECT COUNT(*) as count
    FROM datapoints
    WHERE project_id = {projectId: UUID}
  `;

  // Add dataset filters
  if (datasetId) {
    baseQuery += ` AND dataset_id = {datasetId: UUID}`;
  }

  if (datasetName) {
    baseQuery += ` AND dataset_name = {datasetName: String}`;
  }

  // Add search functionality
  if (searchQuery) {
    baseQuery += ` AND (data LIKE {searchQuery: String} OR target LIKE {searchQuery: String})`;
  }

  const query = addTimeRangeToQuery(baseQuery, timeRange, "created_at");

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: {
      projectId,
      datasetId,
      datasetName,
      searchQuery: searchQuery ? `%${searchQuery}%` : undefined,
    },
  });

  const data = await result.json() as { count: number }[];
  return data[0]?.count || 0;
};

export const getDatapointMetricsOverTime = async (params: DatapointMetricsParams): Promise<MetricTimeValue<number>[]> => {
  const { projectId, datasetId, datasetName, groupByInterval, timeRange } = params;
  const chRoundTime = truncateTimeMap[groupByInterval];

  let baseQuery = `WITH base AS (
    SELECT
      ${chRoundTime}(created_at) as time,
      COUNT(*) as value
    FROM datapoints
    WHERE project_id = {projectId: UUID}
  `;

  // Add dataset filters
  if (datasetId) {
    baseQuery += ` AND dataset_id = {datasetId: UUID}`;
  }

  if (datasetName) {
    baseQuery += ` AND dataset_name = {datasetName: String}`;
  }

  const query = addTimeRangeToQuery(baseQuery, timeRange, "created_at");

  let groupByStatement: string;

  if ("pastHours" in timeRange) {
    if (timeRange.pastHours !== "all") {
      groupByStatement = groupByTimeRelativeStatement(timeRange.pastHours, groupByInterval, "time");
    } else {
      const bounds = await getTimeBounds(projectId, "datapoints", "created_at");
      groupByStatement = groupByTimeAbsoluteStatement(bounds[0], bounds[1], groupByInterval, "time");
    }
  } else {
    groupByStatement = groupByTimeAbsoluteStatement(timeRange.start, timeRange.end, groupByInterval, "time");
  }

  const finalQuery = `${query} 
    GROUP BY time)
  SELECT 
    time,
    toUInt32(any(COALESCE(value, 0))) as value
  FROM base
  ${groupByStatement}`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: "JSONEachRow",
    query_params: {
      projectId,
      datasetId,
      datasetName,
    },
  });

  return await result.json();
};

export const getDatasetSummary = async (
  projectId: string,
  timeRange: TimeRange
): Promise<{
  dataset_name: string;
  dataset_id: string;
  datapoint_count: number;
}[]> => {
  const baseQuery = `
    SELECT
      dataset_name,
      dataset_id,
      COUNT(*) as datapoint_count
    FROM datapoints
    WHERE project_id = {projectId: UUID}
  `;

  const query = addTimeRangeToQuery(baseQuery, timeRange, "created_at");
  const finalQuery = `${query} GROUP BY dataset_name, dataset_id ORDER BY datapoint_count DESC`;

  const result = await clickhouseClient.query({
    query: finalQuery,
    format: "JSONEachRow",
    query_params: {
      projectId,
    },
  });

  return await result.json();
};
