import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { pushQueueItems } from "@/lib/actions/queue";
import { getDatapointCount,getDatapoints as getClickHouseDatapoints } from "@/lib/clickhouse/datapoints";
import { db } from "@/lib/db/drizzle";
import { datapointToSpan, datasetDatapoints } from "@/lib/db/migrations/schema";

export const ListDatapointsSchema = z.object({
  datasetId: z.string(),
  pastHours: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
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
  datasetId: z.string(),
  datapointIds: z.array(z.string()),
});

export const PushDatapointsToQueueSchema = z.object({
  datapointIds: z.array(z.string()),
  datasetId: z.string(),
  queueId: z.string(),
});

export async function getDatapoints(input: z.infer<typeof ListDatapointsSchema>) {
  const { datasetId, pastHours, startTime, endTime, pageNumber, pageSize } = ListDatapointsSchema.parse(input);

  // Get dataset information to determine project ID
  const dataset = await db.query.datasets.findFirst({
    where: (datasets, { eq }) => eq(datasets.id, datasetId),
  });

  if (!dataset) {
    throw new Error("Dataset not found");
  }

  // Build time range for ClickHouse query
  let timeRange;
  if (pastHours && pastHours !== "all") {
    timeRange = { pastHours: parseInt(pastHours) };
  } else if (startTime && endTime) {
    timeRange = { start: new Date(startTime), end: new Date(endTime) };
  } else {
    timeRange = { pastHours: "all" as const };
  }

  // Get datapoints from ClickHouse
  const datapointsData = await getClickHouseDatapoints({
    projectId: dataset.projectId,
    datasetId,
    timeRange,
    pageSize,
    offset: pageNumber * pageSize,
  });

  // Get total count for pagination
  const totalCount = await getDatapointCount({
    projectId: dataset.projectId,
    datasetId,
    timeRange,
  });

  // Transform ClickHouse data to match expected format
  const transformedData = datapointsData.map((dp) => ({
    id: dp.id,
    datasetId: dp.dataset_id,
    createdAt: dp.created_at,
    data: dp.data.substring(0, 100), // Preview only
    target: dp.target ? dp.target.substring(0, 100) : null, // Preview only
    metadata: dp.metadata,
  }));

  return {
    data: transformedData,
    totalCount,
    pageNumber,
    pageSize,
  };
}

export async function pushDatapointsToQueue(input: z.infer<typeof PushDatapointsToQueueSchema>) {
  const { datapointIds, datasetId, queueId } = PushDatapointsToQueueSchema.parse(input);

  const datapoints = await db.query.datasetDatapoints.findMany({
    where: and(inArray(datasetDatapoints.id, datapointIds), eq(datasetDatapoints.datasetId, datasetId)),
  });

  const queueItems = datapoints.map((datapoint, index) => ({
    payload: {
      data: datapoint.data,
      target: datapoint.target,
      metadata: datapoint.metadata,
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

  const res = await db
    .insert(datasetDatapoints)
    .values(
      datapoints.map((datapoint) => ({
        ...datapoint,
        data: datapoint.data,
        createdAt: new Date().toUTCString(),
        datasetId,
      }))
    )
    .returning();

  if (sourceSpanId && res.length > 0) {
    await db
      .insert(datapointToSpan)
      .values(
        res.map((datapoint) => ({
          spanId: sourceSpanId,
          datapointId: datapoint.id,
          projectId,
        }))
      )
      .returning();
  }

  if (res.length === 0) {
    throw new Error("Error creating datasetDatapoints");
  }

  return res[0];
}

export async function deleteDatapoints(input: z.infer<typeof DeleteDatapointsSchema>) {
  const { datasetId, datapointIds } = DeleteDatapointsSchema.parse(input);

  await db
    .delete(datasetDatapoints)
    .where(and(inArray(datasetDatapoints.id, datapointIds), eq(datasetDatapoints.datasetId, datasetId)));
}
