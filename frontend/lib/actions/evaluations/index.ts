import { and, desc, eq, getTableColumns, inArray, type SQL, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils.ts";
import { getEvaluationRunStats } from "@/lib/actions/evaluations/stats";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import { filtersToSql } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";
import { type Evaluation } from "@/lib/evaluation/types";

export const GetEvaluationsSchema = PaginationFiltersSchema.extend({
  projectId: z.guid(),
  groupId: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
});

export const DeleteEvaluationsSchema = z.object({
  projectId: z.guid(),
  evaluationIds: z.array(z.guid()),
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

  const dataPointsCountFilters = otherFilters.filter((f) => f.column === "dataPointsCount");
  const statusFilters = otherFilters.filter((f) => f.column === "status");

  // For filtering purposes, create an expression that checks against the count map
  // Since we can't use ClickHouse in Drizzle filters, we'll filter before paginating
  const sqlFilters = filtersToSql(
    otherFilters.filter((f) => f.column !== "dataPointsCount" && f.column !== "status"),
    [],
    {}
  );

  const allFilters = [...baseFilters, ...(searchFilter ? [searchFilter] : []), ...metadataFilters, ...sqlFilters];

  // dataPointsCount and status both live in ClickHouse, so they can't go into the
  // Drizzle WHERE. Resolve them to an id set first, then constrain the paginated
  // Postgres query with it (same pattern as the queues table's progress filters).
  let evaluationIdFilter: SQL | null = null;
  if (dataPointsCountFilters.length > 0 || statusFilters.length > 0) {
    // First, get all evaluation IDs that match the base filters (project, group, search, metadata)
    const allEvaluations = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(and(...allFilters));

    const allEvaluationIds = allEvaluations.map((e) => e.id);

    if (allEvaluationIds.length === 0) {
      // No evaluations exist with the base filters
      return {
        items: [],
        totalCount: 0,
      };
    }

    const statsMap = await getEvaluationRunStats(projectId, allEvaluationIds);

    const matchingEvaluationIds = allEvaluationIds.filter((evalId) => {
      const stats = statsMap.get(evalId);
      const count = stats?.total ?? 0;
      const countMatches = dataPointsCountFilters.every((filter) => {
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
      if (!countMatches) return false;

      // Status is a categorical label, so only eq/ne are meaningful.
      return statusFilters.every((filter) => {
        const value = String(filter.value);
        switch (filter.operator) {
          case "eq":
            return stats?.status === value;
          case "ne":
            return stats?.status !== value;
          default:
            return true;
        }
      });
    });

    if (matchingEvaluationIds.length === 0) {
      // No evaluations match the filter, return empty result
      return {
        items: [],
        totalCount: 0,
      };
    }

    evaluationIdFilter = inArray(evaluations.id, matchingEvaluationIds);
  }

  const filtersWithEvaluationIds = evaluationIdFilter ? [...allFilters, evaluationIdFilter] : allFilters;

  const result = await paginatedGet<any, Evaluation>({
    table: evaluations,
    columns: getTableColumns(evaluations),
    filters: filtersWithEvaluationIds,
    pageSize,
    pageNumber,
    orderBy: [desc(evaluations.createdAt)],
  });

  // Decorate the page with its datapoint counts + derived run status (one
  // grouped ClickHouse query, scoped to this page's ids).
  let itemsWithCounts = result.items;
  if (result.items.length > 0) {
    const statsMap = await getEvaluationRunStats(
      projectId,
      result.items.map((e: Evaluation) => e.id)
    );

    itemsWithCounts = result.items.map((evaluation: Evaluation) => {
      const stats = statsMap.get(evaluation.id);
      return {
        ...evaluation,
        dataPointsCount: stats?.total ?? 0,
        status: stats?.status ?? "empty",
        statusCounts: stats
          ? { total: stats.total, rooted: stats.rooted, scored: stats.scored, errored: stats.errored }
          : undefined,
      };
    });
  }

  return {
    ...result,
    items: itemsWithCounts,
  };
}

export async function deleteEvaluations(input: z.infer<typeof DeleteEvaluationsSchema>) {
  const { projectId, evaluationIds } = DeleteEvaluationsSchema.parse(input);

  await db.delete(evaluations).where(and(inArray(evaluations.id, evaluationIds), eq(evaluations.projectId, projectId)));

  try {
    await clickhouseClient.command({
      query: `
        DELETE FROM evaluation_datapoints
        WHERE project_id = {projectId: UUID}
          AND evaluation_id IN ({evaluationIds: Array(UUID)})
      `,
      query_params: {
        projectId,
        evaluationIds,
      },
    });
  } catch (error) {
    console.error("Failed to delete evaluation datapoints from ClickHouse:", error);
  }
}
