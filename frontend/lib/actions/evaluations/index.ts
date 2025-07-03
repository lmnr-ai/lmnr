import { and, desc, eq, getTableColumns, inArray, SQL, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";
import { Evaluation } from "@/lib/evaluation/types";

const FilterDefSchema = z.object({
  column: z.string(),
  operator: z.string(),
  value: z.string(),
  castType: z.string().optional(),
});

export const GetEvaluationsSchema = z.object({
  projectId: z.string(),
  groupId: z.string().nullable().optional(),
  pageSize: z
    .string()
    .nullable()
    .default("25")
    .transform((val) => Number(val) || 25),
  pageNumber: z
    .string()
    .nullable()
    .default("0")
    .transform((val) => Number(val) || 0),
  search: z.string().nullable().optional(),
  filters: z
    .array(z.string())
    .default([])
    .transform((filters, ctx) =>
      filters.map((filter) => {
        try {
          const parsed = JSON.parse(filter);
          return FilterDefSchema.parse(parsed);
        } catch (error) {
          ctx.issues.push({
            code: "custom",
            message: `Invalid filter JSON: ${filter}`,
            input: filter,
          });
        }
      })
    ),
});

export const DeleteEvaluationsSchema = z.object({
  projectId: z.string(),
  evaluationIds: z.array(z.string()),
});

export async function getEvaluations(input: z.infer<typeof GetEvaluationsSchema>) {
  const { projectId, groupId, pageSize, pageNumber, search, filters } = input;

  const urlParamFilters: FilterDef[] = compact(filters);

  const baseFilters: SQL[] = [eq(evaluations.projectId, projectId)];
  if (groupId) {
    baseFilters.push(eq(evaluations.groupId, groupId));
  }

  const searchFilter =
    search && search.trim() !== "" ? sql`${evaluations.name} ILIKE ${"%" + search.trim() + "%"}` : null;

  const metadataFilters = urlParamFilters
    .filter((filter) => filter.column === "metadata" && filter.operator === "eq")
    .map((filter) => {
      const [key, value] = filter.value.split(/=(.*)/);
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
  const { projectId, evaluationIds } = input;

  await db.delete(evaluations).where(and(inArray(evaluations.id, evaluationIds), eq(evaluations.projectId, projectId)));
}
