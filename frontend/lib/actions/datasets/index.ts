import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { partition } from "lodash";
import { z } from "zod/v4";

import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { parseFilters } from "@/lib/actions/common/filters";
import { buildSelectQuery } from "@/lib/actions/common/query-builder";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { deleteDatapointsByDatasetIds } from "@/lib/actions/datapoints/clickhouse";
import { executeQuery } from "@/lib/actions/sql";
import { type DatasetInfo } from "@/lib/dataset/types";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";
import { type PaginatedResponse } from "@/lib/types";

const CreateDatasetSchema = z.object({
  name: z.string().min(1, { message: "Dataset name is required" }),
  projectId: z.string(),
});

export const getDatasetsSchema = PaginationFiltersSchema.extend({
  projectId: z.string(),
  search: z.string().nullable().optional(),
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
  const { projectId, pageNumber, pageSize, search, filter } = input;

  const [countFilters, pgFilters] = partition(filter, (f) => f.column === "count");

  if (countFilters.length > 0) {
    const countQuery = buildSelectQuery({
      select: {
        columns: ["dataset_id as datasetId", "COUNT(*) as count"],
        table: "dataset_datapoints",
      },
      groupBy: ["datasetId"],
      havingFilters: countFilters,
      havingColumnFilterConfig: {
        processors: new Map([
          [
            "count",
            (filter, paramKey) => ({
              condition: `count ${OperatorLabelMap[filter.operator]} {${paramKey}: UInt64}`,
              params: { [paramKey]: filter.value },
            }),
          ],
        ]),
      },
    });

    const countRows = await executeQuery<{ datasetId: string; count: number }>({
      query: countQuery.query,
      parameters: countQuery.parameters,
      projectId,
    });

    const qualifyingDatasetIds = countRows.map((row) => row.datasetId);
    const datapointCounts = Object.fromEntries(countRows.map((row) => [row.datasetId, row.count]));

    if (qualifyingDatasetIds.length === 0) {
      return { items: [], totalCount: 0 };
    }

    const filters = [eq(datasets.projectId, projectId), inArray(datasets.id, qualifyingDatasetIds)];

    if (search) {
      filters.push(ilike(datasets.name, `%${search}%`));
    }

    const filterConditions = parseFilters(pgFilters, {
      name: { type: "string", column: datasets.name },
      id: { type: "string", column: datasets.id },
    } as const);

    filters.push(...filterConditions);

    const datasetsData: PaginatedResponse<DatasetInfo> = await paginatedGet({
      table: datasets,
      pageNumber,
      pageSize,
      filters,
      orderBy: [desc(datasets.createdAt)],
    });

    const items = datasetsData.items.map((dataset) => ({
      ...dataset,
      datapointsCount: datapointCounts[dataset.id] ?? 0,
    })) as DatasetInfo[];

    return {
      items,
      totalCount: datasetsData.totalCount,
    };
  }

  const filters = [eq(datasets.projectId, projectId)];

  if (search) {
    filters.push(ilike(datasets.name, `%${search}%`));
  }

  const filterConditions = parseFilters(pgFilters, {
    name: { type: "string", column: datasets.name },
    id: { type: "string", column: datasets.id },
  } as const);

  filters.push(...filterConditions);

  const datasetsData: PaginatedResponse<DatasetInfo> = await paginatedGet({
    table: datasets,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(datasets.createdAt)],
  });

  const datasetIds = datasetsData.items.map((dataset) => (dataset as DatasetInfo).id);

  const countQuery = buildSelectQuery({
    select: {
      columns: ["dataset_id as datasetId", "COUNT(*) as count"],
      table: "dataset_datapoints",
    },
    customConditions: [
      {
        condition: "datasetId IN {datasetIds: Array(UUID)}",
        params: { datasetIds },
      },
    ],
    groupBy: ["datasetId"],
  });

  const rows = await executeQuery<{ datasetId: string; count: number }>({
    query: countQuery.query,
    parameters: countQuery.parameters,
    projectId,
  });

  const datapointCounts = Object.fromEntries(rows.map((row) => [row.datasetId, row.count]));

  const items = datasetsData.items.map((dataset) => ({
    ...dataset,
    datapointsCount: datapointCounts[dataset.id] ?? 0,
  })) as DatasetInfo[];

  return {
    items,
    totalCount: datasetsData.totalCount,
  };
}

export async function deleteDatasets(input: z.infer<typeof deleteDatasetsSchema>) {
  const { projectId, datasetIds } = deleteDatasetsSchema.parse(input);

  await db.delete(datasets).where(and(inArray(datasets.id, datasetIds), eq(datasets.projectId, projectId)));

  await deleteDatapointsByDatasetIds(projectId, datasetIds);
}
