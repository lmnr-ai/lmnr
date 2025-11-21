import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { buildSelectQuery } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { deleteDatapointsByDatasetIds } from "@/lib/clickhouse/datapoints";
import { DatasetInfo } from "@/lib/dataset/types";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";
import { PaginatedResponse } from "@/lib/types";

const CreateDatasetSchema = z.object({
  name: z.string().min(1, { message: "Dataset name is required" }),
  projectId: z.string(),
});

export const getDatasetsSchema = z.object({
  projectId: z.string(),
  pageNumber: z.coerce.number().default(0),
  pageSize: z.coerce.number().default(50),
  search: z.string().nullable().optional(),
  filter: z.array(z.any()).optional().default([]),
});

const deleteDatasetsSchema = z.object({
  projectId: z.string(),
  datasetIds: z.array(z.string()),
});

export async function createDataset(input: z.infer<typeof CreateDatasetSchema>) {
  const { name, projectId } = CreateDatasetSchema.parse(input);

  const dataset = await db
    .insert(datasets)
    .values({ name, projectId })
    .returning()
    .then((res) => res[0]);

  if (!dataset) {
    throw new Error("Failed to create dataset");
  }

  return dataset;
}

export async function getDatasets(input: z.infer<typeof getDatasetsSchema>) {
  const { projectId, pageNumber, pageSize, search, filter } = getDatasetsSchema.parse(input);

  const filters = [eq(datasets.projectId, projectId)];

  if (search) {
    filters.push(ilike(datasets.name, `%${search}%`));
  }

  if (filter && Array.isArray(filter)) {
    filter.forEach((filterItem) => {
      try {
        const f: FilterDef = typeof filterItem === "string" ? JSON.parse(filterItem) : filterItem;
        const { column, operator, value } = f;
        const operatorStr = operator as string;

        if (column === "name") {
          if (operator === "eq") filters.push(eq(datasets.name, value));
          else if (operatorStr === "contains") filters.push(ilike(datasets.name, `%${value}%`));
        } else if (column === "id") {
          if (operator === "eq") filters.push(eq(datasets.id, value));
          else if (operatorStr === "contains") filters.push(ilike(datasets.id, `%${value}%`));
        }
      } catch (error) {
      }
    });
  }

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
      },
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
