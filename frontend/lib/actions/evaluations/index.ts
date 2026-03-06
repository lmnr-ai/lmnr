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

  const dataPointsCountFilters = otherFilters.filter((f) => f.column === "dataPointsCount");

  // For filtering purposes, create an expression that checks against the count map
  // Since we can't use ClickHouse in Drizzle filters, we'll filter before paginating
  const sqlFilters = filtersToSql(
    otherFilters.filter((f) => f.column !== "dataPointsCount"),
    [],
    {}
  );

  const allFilters = [...baseFilters, ...(searchFilter ? [searchFilter] : []), ...metadataFilters, ...sqlFilters];

  // If dataPointsCount filters are present, we need to filter by evaluation IDs first
  let evaluationIdFilter: SQL | null = null;
  if (dataPointsCountFilters.length > 0) {
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

    // Get counts from ClickHouse for these evaluations
    const datapointCounts = await executeQuery<{ evaluation_id: string; count: number }>({
      projectId,
      query: `
        SELECT 
          evaluation_id,
          COUNT(*) as count
        FROM evaluation_datapoints
        WHERE evaluation_id IN {evaluationIds:Array(String)}
        GROUP BY evaluation_id
      `,
      parameters: {
        projectId,
        evaluationIds: allEvaluationIds,
      },
    });

    // Create a count map, defaulting to 0 for evaluations not in ClickHouse results
    const countMap = new Map<string, number>();
    for (const evalId of allEvaluationIds) {
      countMap.set(evalId, 0); // Default to 0
    }
    for (const row of datapointCounts) {
      countMap.set(row.evaluation_id, row.count);
    }

    // Filter evaluation IDs based on dataPointsCount filters
    const matchingEvaluationIds = allEvaluationIds.filter((evalId) => {
      const count = countMap.get(evalId) || 0;
      return dataPointsCountFilters.every((filter) => {
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

  // Fetch counts and scores for the returned evaluations to include in the response
  let itemsWithCountsAndScores = result.items;
  if (result.items.length > 0) {
    const evaluationIds = result.items.map((e: Evaluation) => e.id);

    const [datapointCounts, scoreRows] = await Promise.all([
      executeQuery<{ evaluation_id: string; count: number }>({
        projectId,
        query: `
          SELECT
            evaluation_id,
            COUNT(*) as count
          FROM evaluation_datapoints
          WHERE evaluation_id IN {evaluationIds:Array(String)}
          GROUP BY evaluation_id
        `,
        parameters: {
          projectId,
          evaluationIds,
        },
      }),
      executeQuery<{ evaluation_id: string; scores: string }>({
        projectId,
        query: `
          SELECT
            evaluation_id,
            scores
          FROM evaluation_datapoints FINAL
          WHERE evaluation_id IN {evaluationIds:Array(String)}
        `,
        parameters: {
          projectId,
          evaluationIds,
        },
      }),
    ]);

    const countMap = new Map(datapointCounts.map((row) => [row.evaluation_id, row.count]));

    // Aggregate scores per evaluation: compute average of each score name across datapoints
    const scoreAggregates = new Map<string, Record<string, number>>();
    const scoreCounts = new Map<string, Record<string, number>>();

    for (const row of scoreRows) {
      const scores = (row.scores ? JSON.parse(row.scores) : {}) as Record<string, number | null>;
      if (!scoreAggregates.has(row.evaluation_id)) {
        scoreAggregates.set(row.evaluation_id, {});
        scoreCounts.set(row.evaluation_id, {});
      }
      const agg = scoreAggregates.get(row.evaluation_id)!;
      const cnt = scoreCounts.get(row.evaluation_id)!;
      for (const [name, value] of Object.entries(scores)) {
        if (value !== null && !isNaN(value)) {
          agg[name] = (agg[name] || 0) + value;
          cnt[name] = (cnt[name] || 0) + 1;
        }
      }
    }

    // Compute averages
    const averageScoresMap = new Map<string, Record<string, number>>();
    for (const [evalId, agg] of scoreAggregates.entries()) {
      const cnt = scoreCounts.get(evalId)!;
      const averages: Record<string, number> = {};
      for (const [name, sum] of Object.entries(agg)) {
        averages[name] = sum / cnt[name];
      }
      averageScoresMap.set(evalId, averages);
    }

    itemsWithCountsAndScores = result.items.map((evaluation: Evaluation) => ({
      ...evaluation,
      dataPointsCount: countMap.get(evaluation.id) || 0,
      averageScores: averageScoresMap.get(evaluation.id) || null,
    }));
  }

  return {
    ...result,
    items: itemsWithCountsAndScores,
  };
}

export async function deleteEvaluations(input: z.infer<typeof DeleteEvaluationsSchema>) {
  const { projectId, evaluationIds } = DeleteEvaluationsSchema.parse(input);

  await db.delete(evaluations).where(and(inArray(evaluations.id, evaluationIds), eq(evaluations.projectId, projectId)));
}
