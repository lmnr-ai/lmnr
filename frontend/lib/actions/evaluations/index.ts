import { and, desc, eq, getTableColumns, inArray, SQL, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";
import { Evaluation } from "@/lib/evaluation/types";

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

  const urlParamFilters: FilterDef[] = compact(filter);

  const baseFilters: SQL[] = [eq(evaluations.projectId, projectId)];
  if (groupId) {
    baseFilters.push(eq(evaluations.groupId, groupId));
  }

  const searchFilter = search && search.trim() !== "" ? sql`${evaluations.name} ILIKE ${`%${search.trim()}%`}` : null;

  const metadataFilters = urlParamFilters
    .filter((filter) => filter.column === "metadata" && filter.operator === "eq")
    .map((filter) => {
      const [key, value] = String(filter.value).split(/=(.*)/);
      return sql`${evaluations.metadata} @> ${JSON.stringify({ [key]: value })}`;
    });

  const otherFilters = urlParamFilters.filter((filter) => filter.column !== "metadata");

  const dataPointsCountExpr = sql<number>`COALESCE((
    SELECT COUNT(*)
    FROM ${evaluationResults} dp
    WHERE dp.evaluation_id = evaluations.id
  ), 0)::int`;

  const sqlFilters = filtersToSql(otherFilters, [], {
    dataPointsCount: dataPointsCountExpr,
  });

  const allFilters = [...baseFilters, ...(searchFilter ? [searchFilter] : []), ...metadataFilters, ...sqlFilters];

  const result = await paginatedGet<any, Evaluation>({
    table: evaluations,
    columns: {
      ...getTableColumns(evaluations),
      dataPointsCount: dataPointsCountExpr.as("dataPointsCount"),
    },
    filters: allFilters,
    pageSize,
    pageNumber,
    orderBy: [desc(evaluations.createdAt)],
  });

  return result;
}

export async function deleteEvaluations(input: z.infer<typeof DeleteEvaluationsSchema>) {
  const { projectId, evaluationIds } = DeleteEvaluationsSchema.parse(input);

  await db.delete(evaluations).where(and(inArray(evaluations.id, evaluationIds), eq(evaluations.projectId, projectId)));
}
