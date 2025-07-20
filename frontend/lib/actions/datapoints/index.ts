import { v4 as uuidv4 } from "uuid";
import { z } from "zod/v4";

import { pushQueueItems } from "@/lib/actions/queue";
import {
  createDatapoints as createClickHouseDatapoints,
  deleteDatapoints as deleteClickHouseDatapoints,
  getDatapointCount,
  getDatapoints as getClickHouseDatapoints,
  getDatapointsByIds,
} from "@/lib/clickhouse/datapoints";
import { db } from "@/lib/db/drizzle";
import { datapointToSpan } from "@/lib/db/migrations/schema";

export const ListDatapointsSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  pageNumber: z.number().default(0),
  pageSize: z.number().default(50),
});

export const CreateDatapointsSchema = z.object({
  datapoints: z.array(
    z.object({
      data: z.any(),
      target: z.any().optional(),
      metadata: z.any().optional(),
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

export async function getDatapoints(input: z.infer<typeof ListDatapointsSchema>) {
  const { projectId, datasetId, pageNumber, pageSize } = ListDatapointsSchema.parse(input);

  // Get datapoints from ClickHouse
  const datapointsData = await getClickHouseDatapoints({
    projectId,
    datasetId,
    pageSize,
    offset: pageNumber * pageSize,
  });

  // Get total count for pagination
  const totalCount = await getDatapointCount({
    projectId,
    datasetId,
  });

  // Transform ClickHouse data to match expected format
  const transformedData = datapointsData.map((dp) => ({
    id: dp.id,
    datasetId: dp.dataset_id,
    createdAt: dp.created_at,
    data: dp.data,
    target: dp.target,
    metadata: dp.metadata,
  }));

  return {
    items: transformedData,
    totalCount,
    pageNumber,
    pageSize,
  };
}

export async function pushDatapointsToQueue(input: z.infer<typeof PushDatapointsToQueueSchema>) {
  const { datapointIds, projectId, datasetId, queueId } = PushDatapointsToQueueSchema.parse(input);

  // Get datapoints from ClickHouse
  const datapoints = await getDatapointsByIds(projectId, datapointIds, datasetId);

  const queueItems = datapoints.map((datapoint, index) => ({
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
    createdAt: new Date(Date.now() + index).toISOString(),
  }));

  const result = await pushQueueItems({
    queueId,
    items: queueItems,
  });

  return result;
}

export async function createDatapoints(input: z.infer<typeof CreateDatapointsInputSchema>) {
  const { projectId, datasetId, datapoints, sourceSpanId } = CreateDatapointsInputSchema.parse(input);

  // Generate IDs and prepare datapoints for ClickHouse
  const datapointsWithIds = datapoints.map((datapoint: any) => ({
    id: uuidv4(),
    data: datapoint.data,
    target: datapoint.target,
    metadata: datapoint.metadata || {},
    createdAt: new Date().toISOString(),
  }));

  // Insert into ClickHouse
  await createClickHouseDatapoints(
    projectId,
    datasetId,
    datapointsWithIds
  );

  // Create span-to-datapoint relationships in PostgreSQL if needed
  if (sourceSpanId && datapointsWithIds.length > 0) {
    await db
      .insert(datapointToSpan)
      .values(
        datapointsWithIds.map((datapoint: any) => ({
          spanId: sourceSpanId,
          datapointId: datapoint.id,
          projectId,
        }))
      )
      .returning();
  }

  return datapointsWithIds[0];
}

export async function deleteDatapoints(input: z.infer<typeof DeleteDatapointsSchema>) {
  const { projectId, datasetId, datapointIds } = DeleteDatapointsSchema.parse(input);

  // Delete from ClickHouse only
  await deleteClickHouseDatapoints(projectId, datapointIds);
}
