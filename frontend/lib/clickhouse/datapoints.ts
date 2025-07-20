import { clickhouseClient } from "@/lib/clickhouse/client";

export interface DatapointSearchParams {
  projectId: string;
  datasetId?: string;
  searchQuery?: string;
  pageSize?: number;
  offset?: number;
}

export interface DatapointResult {
  id: string;
  datasetId: string;
  projectId: string;
  createdAt: string;
  data: string;
  target: string;
  metadata: string;
}

export const getDatapoint = async (projectId: string, datapointId: string, datasetId: string): Promise<DatapointResult | null> => {
  const query = `
    SELECT 
      id,
      dataset_id as datasetId,
      project_id as projectId,
      created_at as createdAt,
      data,
      target,
      metadata
    FROM datapoints
    WHERE project_id = {projectId: UUID}
    AND id = {datapointId: UUID}
    AND dataset_id = {datasetId: UUID}
    LIMIT 1
  `;

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: {
      projectId,
      datasetId,
      datapointId,
    },
  });

  const data = await result.json() as DatapointResult[];
  return data[0] || null;
};

export const getDatapointsByIds = async (
  projectId: string,
  datapointIds: string[],
  datasetId?: string
): Promise<DatapointResult[]> => {
  if (datapointIds.length === 0) {
    return [];
  }

  let query = `
    SELECT 
      id,
      dataset_id as datasetId,
      project_id as projectId,
      created_at as createdAt,
      data,
      target,
      metadata
    FROM datapoints
    WHERE project_id = {projectId: UUID}
    AND id IN ({datapointIds: Array(UUID)})
  `;

  const queryParams: any = {
    projectId,
    datapointIds,
  };

  if (datasetId) {
    query += ` AND dataset_id = {datasetId: UUID}`;
    queryParams.datasetId = datasetId;
  }

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: queryParams,
  });

  return await result.json();
};

export const getAllDatapointsForDataset = async (
  projectId: string,
  datasetId: string
): Promise<DatapointResult[]> => {
  const query = `
    SELECT 
      id,
      dataset_id as datasetId,
      project_id as projectId,
      created_at as createdAt,
      data,
      target,
      metadata
    FROM datapoints
    WHERE project_id = {projectId: UUID}
    AND dataset_id = {datasetId: UUID}
    ORDER BY created_at ASC
  `;

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: {
      projectId,
      datasetId,
    },
  });

  return await result.json();
};

export const getDatapoints = async (params: DatapointSearchParams): Promise<DatapointResult[]> => {
  const { projectId, datasetId, searchQuery, pageSize = 50, offset = 0 } = params;

  let baseQuery = `
    SELECT 
      id,
      dataset_id as datasetId,
      project_id as projectId,
      created_at as createdAt,
      substring(data, 1, 100) as data,
      substring(target, 1, 100) as target,
      metadata
    FROM datapoints
    WHERE project_id = {projectId: UUID}
  `;

  // Add dataset filters
  if (datasetId) {
    baseQuery += ` AND dataset_id = {datasetId: UUID}`;
  }

  // Add search functionality
  if (searchQuery) {
    baseQuery += ` AND (data LIKE {searchQuery: String} OR target LIKE {searchQuery: String})`;
  }

  const query = baseQuery;

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
      searchQuery: searchQuery ? `%${searchQuery}%` : undefined,
      pageSize,
      offset,
    },
  });

  return await result.json();
};

export const getDatapointCount = async (params: Omit<DatapointSearchParams, 'pageSize' | 'offset'>): Promise<number> => {
  const { projectId, datasetId, searchQuery } = params;

  let baseQuery = `
    SELECT COUNT(*) as count
    FROM datapoints
    WHERE project_id = {projectId: UUID}
  `;

  // Add dataset filters
  if (datasetId) {
    baseQuery += ` AND dataset_id = {datasetId: UUID}`;
  }

  // Add search functionality
  if (searchQuery) {
    baseQuery += ` AND (data LIKE {searchQuery: String} OR target LIKE {searchQuery: String})`;
  }

  const query = baseQuery;

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: {
      projectId,
      datasetId,
      searchQuery: searchQuery ? `%${searchQuery}%` : undefined,
    },
  });

  const data = await result.json() as { count: number }[];
  return data[0]?.count || 0;
};

export const createDatapoints = async (
  projectId: string,
  datasetId: string,
  datapoints: Array<{
    id: string;
    data: any;
    target?: any;
    metadata: any;
    createdAt: string;
  }>
): Promise<void> => {
  if (datapoints.length === 0) {
    return;
  }

  // Prepare the data for batch insert
  const rows = datapoints.map((dp) => ({
    id: dp.id,
    dataset_id: datasetId,
    project_id: projectId,
    created_at: dp.createdAt,
    data: dp.data ? JSON.stringify(dp.data) : '<null>',
    target: dp.target ? JSON.stringify(dp.target) : '<null>',
    metadata: dp.metadata ? JSON.stringify(dp.metadata) : '<null>',
  }));

  // Use batch insert similar to Rust implementation
  const insert = clickhouseClient.insert({
    table: 'datapoints',
    values: rows,
    format: 'JSONEachRow',
  });

  await insert;
};

export const updateDatapoint = async (
  projectId: string,
  datapointId: string,
  datasetId: string,
  data: any,
  target: any,
  metadata: any,
  createdAt: string
): Promise<void> => {
  // Delete the existing datapoint
  await deleteDatapoints(projectId, [datapointId]);

  // Insert the new datapoint with updated data
  await createDatapoints(
    projectId,
    datasetId,
    [{
      id: datapointId, // Keep the same ID
      data: data,
      target: target,
      metadata: metadata,
      createdAt: createdAt, // Use the passed creation time
    }]
  );
};

export const deleteDatapoints = async (
  projectId: string,
  datapointIds: string[]
): Promise<void> => {
  if (datapointIds.length === 0) {
    return;
  }

  const query = `
    DELETE FROM datapoints
    WHERE project_id = {projectId: UUID}
    AND id IN ({datapointIds: Array(UUID)})
  `;

  await clickhouseClient.command({
    query,
    query_params: {
      projectId,
      datapointIds,
    },
  });
};
