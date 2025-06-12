import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { pushQueueItems } from "@/lib/actions/queue";
import { Datapoint } from "@/lib/dataset/types";
import { db } from "@/lib/db/drizzle";
import { datapointToSpan, datasetDatapoints } from "@/lib/db/migrations/schema";
import { getDateRangeFilters, paginatedGet } from "@/lib/db/utils";

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

  const baseFilters = [eq(datasetDatapoints.datasetId, datasetId)];
  // don't query input and output, only query previews
  const { data, target, ...rest } = getTableColumns(datasetDatapoints);
  const customColumns = {
    data: sql<string>`SUBSTRING(data::text, 0, 100)`.as("data"),
    target: sql<string>`SUBSTRING(target::text, 0, 100)`.as("target"),
  };

  const datapointsData = await paginatedGet<any, Datapoint>({
    table: datasetDatapoints,
    pageNumber,
    pageSize,
    filters: [...baseFilters, ...getDateRangeFilters(startTime ?? null, endTime ?? null, pastHours ?? null)],
    orderBy: [desc(datasetDatapoints.createdAt), desc(datasetDatapoints.indexInBatch)],
    columns: {
      ...rest,
      ...customColumns,
    },
  });

  return datapointsData;
}

export async function pushDatapointsToQueue(input: z.infer<typeof PushDatapointsToQueueSchema>) {
  const { datapointIds, datasetId, queueId } = PushDatapointsToQueueSchema.parse(input);

  const datapoints = await db.query.datasetDatapoints.findMany({
    where: and(inArray(datasetDatapoints.id, datapointIds), eq(datasetDatapoints.datasetId, datasetId)),
  });

  // Map datapoints to queue items format
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
