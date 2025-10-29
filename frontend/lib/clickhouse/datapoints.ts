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

export const createDatapoints = async (
  projectId: string,
  datasetId: string,
  datapoints: Array<{
    id: string;
    data: any;
    target?: any;
    metadata: any;
    createdAt: string;
  }>,
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
    data: dp.data !== undefined && dp.data !== null ? JSON.stringify(dp.data) : '{}',
    target: dp.target !== undefined && dp.target !== null ? JSON.stringify(dp.target) : '{}',
    metadata: dp.metadata !== undefined && dp.metadata !== null ? JSON.stringify(dp.metadata) : '{}',
  }));

  await clickhouseClient.insert({
    table: 'dataset_datapoints',
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: {
      wait_for_async_insert: 1,
      async_insert: 1,
    },
  });
};

export const deleteDatapoints = async (
  projectId: string,
  datasetId: string,
  datapointIds: string[]
): Promise<void> => {
  if (datapointIds.length === 0) {
    return;
  }

  const query = `
    DELETE FROM dataset_datapoints
    WHERE project_id = {projectId: UUID}
    AND dataset_id = {datasetId: UUID}
    AND id IN ({datapointIds: Array(UUID)})
  `;

  await clickhouseClient.command({
    query,
    query_params: {
      projectId,
      datasetId,
      datapointIds,
    },
  });
};

export const deleteDatapointsByDatasetIds = async (projectId: string, datasetIds: string[]): Promise<void> => {
  if (datasetIds.length === 0) {
    return;
  }

  const query = `
    DELETE FROM dataset_datapoints
    WHERE project_id = {projectId: UUID}
    AND dataset_id IN ({datasetIds: Array(UUID)})
  `;

  await clickhouseClient.command({
    query,
    query_params: {
      projectId,
      datasetIds,
    },
  });
};
