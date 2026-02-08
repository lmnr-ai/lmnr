import { and, desc, eq, getTableColumns, inArray, type SQL, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import { filtersToSql } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";
import { type Evaluation } from "@/lib/evaluation/types";

export const GetEvaluationsSchema = PaginationFiltersSchema.extend({
  projectId: z.string(),
  groupId: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
});

export const DeleteEvaluationsSchema = z.object({
  projectId: z.string(),
  evaluationIds: z.array(z.string()),
});

export async function getEvaluations(input: z.infer<typeof GetEvaluationsSchema>) {
  const { projectId, groupId, pageSize, pageNumber, search, filter } = input;

  const urlParamFilters: Filter[] = compact(filter);

  const baseFilters: SQL[] = [eq(evaluations.projectId, projectId)];
  if (groupId) {
    baseFilters.push(eq(evaluations.groupId, groupId));
  }

  const searchFilter = search && search.trim() !== "" ? sql`${evaluations.name} ILIKE ${`%${search.trim()}%`}` : null;

  const metadataFilters = urlParamFilters
    .filter((filter) => filter.column === "metadata" && filter.operator === "eq")
    .map((filter) => {
      const [key, value] = String(filter.value).split(/=(.*)/);
      if (key && value) {
        const parsedValue = tryParseJson(value);
        const typedMatch = sql`${evaluations.metadata} @> ${JSON.stringify({ [key]: parsedValue })}`;
        const stringMatch = sql`${evaluations.metadata}->>${key} = ${String(value)}`;
        return sql`(${typedMatch} OR ${stringMatch})`;
      }
      return sql`1=1`;
    });

  const otherFilters = urlParamFilters.filter((filter) => filter.column !== "metadata");

  const datapointCounts = await executeQuery<{ evaluation_id: string; count: number }>({
    projectId,
    query: `
      SELECT 
        evaluation_id,
        COUNT(*) as count
      FROM evaluation_datapoints
      GROUP BY evaluation_id
    `,
    parameters: { projectId },
  });

  // Create a map of evaluation_id to count for quick lookup
  const countMap = new Map(datapointCounts.map((row) => [row.evaluation_id, row.count]));

  // For filtering purposes, create an expression that checks against the count map
  // Since we can't use ClickHouse in Drizzle filters, we'll filter after fetching
  const sqlFilters = filtersToSql(
    otherFilters.filter((f) => f.column !== "dataPointsCount"),
    [],
    {}
  );

  const allFilters = [...baseFilters, ...(searchFilter ? [searchFilter] : []), ...metadataFilters, ...sqlFilters];

  const result = await paginatedGet<any, Evaluation>({
    table: evaluations,
    columns: getTableColumns(evaluations),
    filters: allFilters,
    pageSize,
    pageNumber,
    orderBy: [desc(evaluations.createdAt)],
  });

  // Apply dataPointsCount filters manually if present
  const dataPointsCountFilters = otherFilters.filter((f) => f.column === "dataPointsCount");
  let filteredData = result.items.map((evaluation: Evaluation) => ({
    ...evaluation,
    dataPointsCount: countMap.get(evaluation.id) || 0,
  }));

  // Apply count filters if present
  if (dataPointsCountFilters.length > 0) {
    filteredData = filteredData.filter((evaluation: Evaluation & { dataPointsCount: number }) => {
      return dataPointsCountFilters.every((filter) => {
        const count = evaluation.dataPointsCount;
        const value = Number(filter.value);
        switch (filter.operator) {
          case "eq":
            return count === value;
          case "ne":
            return count !== value;
          case "gt":
            return count > value;
          case "gte":
            return count >= value;
          case "lt":
            return count < value;
          case "lte":
            return count <= value;
          default:
            return true;
        }
      });
    });
  }

  return {
    ...result,
    items: filteredData,
  };
}

export async function deleteEvaluations(input: z.infer<typeof DeleteEvaluationsSchema>) {
  const { projectId, evaluationIds } = DeleteEvaluationsSchema.parse(input);

  await db.delete(evaluations).where(and(inArray(evaluations.id, evaluationIds), eq(evaluations.projectId, projectId)));
}
