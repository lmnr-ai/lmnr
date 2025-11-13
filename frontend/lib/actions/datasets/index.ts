import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { buildSelectQuery } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { deleteDatapointsByDatasetIds } from "@/lib/clickhouse/datapoints";
import { DatasetInfo } from "@/lib/dataset/types";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";
import { PaginatedResponse } from "@/lib/types";

const CreateDatasetSchema = z.object({
  name: z.string().min(1, { message: "Dataset name is required" }),
  projectId: z.string(),
});

const getDatasetsSchema = z.object({
  projectId: z.string(),
  pageNumber: z.number().optional(),
  pageSize: z.number().optional(),
});

const deleteDatasetsSchema = z.object({
  projectId: z.string(),
  datasetIds: z.array(z.string()),
});

export async function createDataset(input: z.infer<typeof CreateDatasetSchema>) {
  const { name, projectId } = CreateDatasetSchema.parse(input);

  const dataset = await db.insert(datasets).values({ name, projectId }).returning().then((res) => res[0]);

  if (!dataset) {
    throw new Error("Failed to create dataset");
  }

  return dataset;
}

export async function getDatasets(input: z.infer<typeof getDatasetsSchema>) {
  const { projectId, pageNumber, pageSize } = getDatasetsSchema.parse(input);


  const filters = [eq(datasets.projectId, projectId)];

  const datasetsData: PaginatedResponse<DatasetInfo> = await paginatedGet({
    table: datasets,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(datasets.createdAt)],
  });

  const datasetIds = datasetsData.items.map((dataset) => (dataset as DatasetInfo).id);

  const query = buildSelectQuery({
    select: {
      columns: ["dataset_id", "COUNT(*) as count"],
      table: "dataset_datapoints",
    },
    customConditions: [
      {
        condition: "dataset_id IN {datasetIds: Array(UUID)}",
        params: { datasetIds },
      }
    ],
    groupBy: ["dataset_id"],
  });

  const rows = await executeQuery({
    query: query.query,
    parameters: query.parameters,
    projectId,
  });

  const datapointCounts = Object.fromEntries(rows.map((row: any) => [row.dataset_id, row.count]));

  const items = datasetsData.items.map((dataset: any) => ({
    ...dataset,
    datapointsCount: datapointCounts[dataset.id] ?? 0,
  })) as DatasetInfo[];

  const response: PaginatedResponse<DatasetInfo> = {
    items,
    totalCount: datasetsData.totalCount,
  };

  return response;
}

export async function deleteDatasets(input: z.infer<typeof deleteDatasetsSchema>) {
  const { projectId, datasetIds } = deleteDatasetsSchema.parse(input);

  await db.delete(datasets).where(and(inArray(datasets.id, datasetIds), eq(datasets.projectId, projectId)));

  await deleteDatapointsByDatasetIds(projectId, datasetIds);
}
