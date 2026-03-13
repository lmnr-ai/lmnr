import { z } from "zod/v4";

import {
  createDatapoints as createClickHouseDatapoints,
  type DatapointResult,
  deleteDatapoints as deleteClickHouseDatapoints,
} from "@/lib/actions/datapoints/clickhouse";
import {
  buildAllDatapointsQueryWithParams,
  buildDatapointCountQueryWithParams,
  buildDatapointsByIdsQueryWithParams,
  buildDatapointsQueryWithParams,
} from "@/lib/actions/datapoints/utils";
import { pushQueueItems } from "@/lib/actions/queue";
import { executeQuery } from "@/lib/actions/sql";
import { generateSequentialUuidsV7 } from "@/lib/utils";

export const ListDatapointsSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  pageNumber: z.number().default(0),
  pageSize: z.number().default(50),
});

export const CreateDatapointsSchema = z.object({
  datapoints: z.array(
    z.object({
      id: z.string().optional(),
      data: z.any(),
      target: z.any().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    })
  ),
  sourceSpanId: z.string().optional(),
});

export const CreateDatapointsInputSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  datapoints: CreateDatapointsSchema.shape.datapoints,
  sourceSpanId: CreateDatapointsSchema.shape.sourceSpanId,
});

export const DeleteDatapointsSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  datapointIds: z.array(z.string()),
});

export const PushDatapointsToQueueSchema = z.object({
  datapointIds: z.array(z.string()),
  projectId: z.string(),
  datasetId: z.string(),
  queueId: z.string(),
});

export const CountDatapointsSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
});

export async function countDatapoints(input: z.infer<typeof CountDatapointsSchema>) {
  const { projectId, datasetId } = CountDatapointsSchema.parse(input);

  // Get total count for pagination
  const { query: countQuery, parameters: countParams } = buildDatapointCountQueryWithParams({
    datasetId,
  });

  const countResult = await executeQuery<{ count: number }>({
    query: countQuery,
    parameters: countParams,
    projectId,
  });

  const totalCount = countResult[0]?.count || 0;

  return {
    totalCount,
  };
}
export async function getDatapoints(input: z.infer<typeof ListDatapointsSchema>) {
  const { projectId, datasetId, pageNumber, pageSize } = ListDatapointsSchema.parse(input);

  const offset = Math.max(0, pageNumber * pageSize);

  // Get datapoints using SQL endpoint
  const { query: datapointsQuery, parameters: datapointsParams } = buildDatapointsQueryWithParams({
    datasetId,
    pageSize,
    offset,
  });

  const datapointsData = (await executeQuery<Record<string, unknown>>({
    query: datapointsQuery,
    parameters: datapointsParams,
    projectId,
  })) as unknown as DatapointResult[];

  return {
    items: datapointsData,
    pageNumber,
    pageSize,
  };
}

export async function pushDatapointsToQueue(input: z.infer<typeof PushDatapointsToQueueSchema>) {
  const { datapointIds, projectId, datasetId, queueId } = PushDatapointsToQueueSchema.parse(input);

  if (datapointIds.length === 0) {
    return { success: true, count: 0 };
  }

  // Get datapoints using SQL endpoint
  const { query, parameters } = buildDatapointsByIdsQueryWithParams({
    datapointIds,
    datasetId,
  });

  const datapoints = (await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  })) as unknown as DatapointResult[];

  const queueItems = datapoints.map((datapoint) => ({
    payload: {
      data: JSON.parse(datapoint.data),
      target: datapoint.target ? JSON.parse(datapoint.target) : null,
      metadata: JSON.parse(datapoint.metadata),
    },
    metadata: {
      source: "datapoint" as const,
      datasetId: datasetId,
      id: datapoint.id,
    },
    createdAt: new Date().toISOString(),
  }));

  const result = await pushQueueItems({
    queueId,
    items: queueItems,
  });

  return result;
}

export async function createDatapoints(input: z.infer<typeof CreateDatapointsInputSchema>) {
  const { projectId, datasetId, datapoints } = CreateDatapointsInputSchema.parse(input);

  // The table is sorted by id (within each dataset), so we need to generate sequential UUIDs.
  const ids = generateSequentialUuidsV7(datapoints.length);

  // Generate IDs and prepare datapoints for ClickHouse
  const datapointsWithIds = datapoints.map((datapoint: any, index: number) => ({
    id: ids[index],
    data: datapoint.data,
    target: datapoint.target,
    metadata: datapoint.metadata || {},
    createdAt: new Date().toISOString(),
  }));

  // Insert into ClickHouse
  await createClickHouseDatapoints(projectId, datasetId, datapointsWithIds);

  return datapointsWithIds;
}

export async function deleteDatapoints(input: z.infer<typeof DeleteDatapointsSchema>) {
  const { projectId, datasetId, datapointIds } = DeleteDatapointsSchema.parse(input);

  // Delete from ClickHouse only
  await deleteClickHouseDatapoints(projectId, datasetId, datapointIds);
}

export async function getAllDatapointsForDataset(projectId: string, datasetId: string) {
  // Get all datapoints using SQL endpoint
  const { query, parameters } = buildAllDatapointsQueryWithParams({
    projectId,
    datasetId,
  });

  const datapoints = (await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  })) as unknown as DatapointResult[];

  return datapoints;
}
