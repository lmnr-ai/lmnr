import { and, desc, eq, getTableColumns, inArray, type SQL, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";
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

export const MoveEvaluationsSchema = z.object({
  projectId: z.guid(),
  evaluationIds: z.array(z.guid()).min(1),
  groupId: z.string().trim().min(1),
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

  // Fetch counts for the returned evaluations to include in the response
  let itemsWithCounts = result.items;
  if (result.items.length > 0) {
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
        evaluationIds: result.items.map((e: Evaluation) => e.id),
      },
    });

    const countMap = new Map(datapointCounts.map((row) => [row.evaluation_id, row.count]));

    itemsWithCounts = result.items.map((evaluation: Evaluation) => ({
      ...evaluation,
      dataPointsCount: countMap.get(evaluation.id) || 0,
    }));
  }

  return {
    ...result,
    items: itemsWithCounts,
  };
}

export async function moveEvaluations(input: z.infer<typeof MoveEvaluationsSchema>) {
  const { projectId, evaluationIds, groupId } = MoveEvaluationsSchema.parse(input);

  // Postgres is the source of truth for group membership; update it first. If it
  // throws we've changed nothing and bail cleanly.
  await db
    .update(evaluations)
    .set({ groupId })
    .where(and(inArray(evaluations.id, evaluationIds), eq(evaluations.projectId, projectId)));

  // Datapoints carry a denormalized group_id that the group progression chart
  // reads (WHERE group_id = ...), so it must follow. evaluation_datapoints is a
  // ReplacingMergeTree(updated_at): re-insert the latest (FINAL) version of each
  // row with the new group_id + a fresh updated_at so it wins on the next merge /
  // FINAL read. Unlike deleteEvaluations we do NOT swallow errors here — a stale
  // group_id is *visible* (chart drift), so we fail loud and let the caller surface
  // it; a retry is idempotent (Postgres update is a no-op, the re-insert re-wins).
  //
  // NOTE: the column list is hardcoded and MUST stay in sync with the
  // evaluation_datapoints schema — INSERT ... SELECT maps positionally, so a new
  // column added to the table without updating this list will corrupt re-inserted
  // rows. Cross-check against app-server CHEvaluationDatapoint when the schema changes.
  await clickhouseClient.command({
    query: `
      INSERT INTO evaluation_datapoints
        (id, evaluation_id, project_id, trace_id, updated_at, data, target, metadata,
         executor_output, index, dataset_id, dataset_datapoint_id, dataset_datapoint_created_at,
         group_id, scores)
      SELECT
        id, evaluation_id, project_id, trace_id, now64(9) AS updated_at, data, target, metadata,
        executor_output, index, dataset_id, dataset_datapoint_id, dataset_datapoint_created_at,
        {groupId: String} AS group_id, scores
      FROM evaluation_datapoints FINAL
      WHERE project_id = {projectId: UUID}
        AND evaluation_id IN ({evaluationIds: Array(UUID)})
    `,
    query_params: {
      projectId,
      evaluationIds,
      groupId,
    },
    // Re-insert must be durable before we report success (shared client defaults
    // to wait_for_async_insert: 0).
    clickhouse_settings: {
      wait_for_async_insert: 1,
    },
  });
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
