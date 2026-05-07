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
    data: dp.data !== undefined && dp.data !== null ? JSON.stringify(dp.data) : "{}",
    target: dp.target !== undefined && dp.target !== null ? JSON.stringify(dp.target) : "{}",
    metadata: dp.metadata !== undefined && dp.metadata !== null ? JSON.stringify(dp.metadata) : "{}",
  }));

  await clickhouseClient.insert({
    table: "dataset_datapoints",
    values: rows,
    format: "JSONEachRow",
    clickhouse_settings: {
      wait_for_async_insert: 1,
      async_insert: 1,
    },
  });
};

/**
 * Return the subset of `ids` already present in `dataset_datapoints`. Used by
 * `pushItemsToDataset` to make the queue → dataset transfer retry-safe: if
 * `createDatapoints` succeeds but `deleteQueueItems` fails, a subsequent retry
 * uses this to skip re-inserting the same rows (the table is `MergeTree`, so
 * duplicate ids do NOT collapse on merge — they persist as distinct rows).
 */
export const filterExistingDatapointIds = async (
  projectId: string,
  datasetId: string,
  ids: string[]
): Promise<Set<string>> => {
  if (ids.length === 0) return new Set();

  const query = `
    SELECT DISTINCT toString(id) AS id
    FROM dataset_datapoints
    WHERE project_id = {projectId: UUID}
      AND dataset_id = {datasetId: UUID}
      AND id IN ({ids: Array(UUID)})
  `;

  const result = await clickhouseClient.query({
    query,
    query_params: { projectId, datasetId, ids },
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as { id: string }[];
  return new Set(rows.map((r) => r.id));
};

export const deleteDatapoints = async (projectId: string, datasetId: string, datapointIds: string[]): Promise<void> => {
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
