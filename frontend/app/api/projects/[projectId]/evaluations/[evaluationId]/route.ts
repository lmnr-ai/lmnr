import { and, asc, eq, inArray, SQL,sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations, evaluationScores, traces } from "@/lib/db/migrations/schema";
import { DatatableFilter } from "@/lib/types";
import { getFilterFromUrlParams } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

  // Get search params
  const search = req.nextUrl.searchParams.get("search");

  // Get filters
  let urlParamFilters: DatatableFilter[] = [];
  try {
    const filterParam = req.nextUrl.searchParams.get("filter");
    if (filterParam) {
      const parsedFilters = getFilterFromUrlParams(filterParam);
      if (parsedFilters) {
        urlParamFilters = parsedFilters;
      }
    }
  } catch (e) {
    console.error("Error parsing filters:", e);
  }

  // First, get the evaluation to extract its creation time
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    return Response.json({ error: "Evaluation not found" }, { status: 404 });
  }

  // Check for span search
  let searchTraceIds: string[] = [];
  if (search && search.trim() !== "") {
    try {
      // Always search in both span input and output
      const spanSearchTypes = [SpanSearchType.Input, SpanSearchType.Output];

      // Calculate time range based on evaluation creation time
      const startTime = new Date(evaluation.createdAt);
      const endTime = new Date(evaluation.createdAt);
      endTime.setHours(endTime.getHours() + 24); // Add 24 hours

      // Search in spans with proper time range
      const result = await searchSpans({
        projectId,
        searchQuery: search,
        timeRange: {
          start: startTime,
          end: endTime
        },
        searchType: spanSearchTypes,
      });

      searchTraceIds = Array.from(result.traceIds);
    } catch (error) {
      console.error("Error searching spans:", error);
    }
  }

  const subQueryScoreCte = db.$with("scores").as(
    db
      .select({
        resultId: evaluationScores.resultId,
        cteScores: sql`jsonb_object_agg(${evaluationScores.name}, ${evaluationScores.score})`.as("cte_scores"),
      })
      .from(evaluationScores)
      .groupBy(evaluationScores.resultId)
  );

  // Build all where conditions
  const whereConditions = [eq(evaluationResults.evaluationId, evaluationId)];

  // Handle search conditions
  if (search && search.trim() !== "") {
    // Build search conditions for regular fields
    const regularSearchConditions: SQL<unknown>[] = [
      sql`${evaluationResults.data}::text ILIKE ${'%' + search + '%'}`,
      sql`${evaluationResults.target}::text ILIKE ${'%' + search + '%'}`,
      sql`${evaluationResults.executorOutput}::text ILIKE ${'%' + search + '%'}`,
      sql`${subQueryScoreCte.cteScores}::text ILIKE ${'%' + search + '%'}`
    ];

    // If we found matching traces via span search, include those matches
    if (searchTraceIds.length > 0) {
      regularSearchConditions.push(
        inArray(evaluationResults.traceId, searchTraceIds)
      );
    }

    // Build OR condition manually
    if (regularSearchConditions.length === 1) {
      whereConditions.push(regularSearchConditions[0]);
    } else {
      let orCondition = sql`(${regularSearchConditions[0]}`;
      for (let i = 1; i < regularSearchConditions.length; i++) {
        orCondition = sql`${orCondition} OR ${regularSearchConditions[i]}`;
      }
      orCondition = sql`${orCondition})`;
      whereConditions.push(orCondition);
    }
  }

  // Duration expression (in seconds)
  const durationExpr = sql`EXTRACT(EPOCH FROM (${traces.endTime} - ${traces.startTime}))`;

  // Total cost expression
  const costExpr = sql`(COALESCE(${traces.inputCost}, 0) + COALESCE(${traces.outputCost}, 0))`;

  // Add filter conditions
  urlParamFilters.forEach(filter => {
    const column = filter.column;
    const value = filter.value;
    const operator = filter.operator;

    // Handle different column types
    if (column === "index") {
      whereConditions.push(eq(evaluationResults.index, parseInt(value)));
    } else if (column === "traceId") {
      whereConditions.push(eq(evaluationResults.traceId, value));

    } else if (column === "duration") {
      if (operator === "gt") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${durationExpr} > ${numValue}`);
      } else if (operator === "gte") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${durationExpr} >= ${numValue}`);
      } else if (operator === "lt") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${durationExpr} < ${numValue}`);
      } else if (operator === "lte") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${durationExpr} <= ${numValue}`);
      } else if (operator === "eq") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${durationExpr} = ${numValue}`);
      } else {
        // Default to equals if no operator specified
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          whereConditions.push(sql`${durationExpr} = ${numValue}`);
        }
      }
    } else if (column === "cost") {
      // Handle cost filtering with comparison operators
      if (operator === "gt") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${costExpr} > ${numValue}`);
      } else if (operator === "gte") {
        const numValue = parseFloat(value.substring(2));
        whereConditions.push(sql`${costExpr} >= ${numValue}`);
      } else if (operator === "lt") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${costExpr} < ${numValue}`);
      } else if (operator === "lte") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${costExpr} <= ${numValue}`);
      } else if (operator === "eq") {
        const numValue = parseFloat(value);
        whereConditions.push(sql`${costExpr} = ${numValue}`);
      } else {
        // Default to equals if no operator specified
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          whereConditions.push(sql`${costExpr} = ${numValue}`);
        }
      }
    } else {
      // Default text search for ID
      whereConditions.push(sql`${evaluationResults.id}::text ILIKE ${'%' + value + '%'}`);
    }
  });

  const getEvaluationResults = db
    .with(subQueryScoreCte)
    .select({
      id: evaluationResults.id,
      createdAt: evaluationResults.createdAt,
      evaluationId: evaluationResults.evaluationId,
      data: evaluationResults.data,
      target: evaluationResults.target,
      executorOutput: evaluationResults.executorOutput,
      scores: subQueryScoreCte.cteScores,
      index: evaluationResults.index,
      traceId: evaluationResults.traceId,
      startTime: traces.startTime,
      endTime: traces.endTime,
      inputCost: traces.inputCost,
      outputCost: traces.outputCost
    })
    .from(evaluationResults)
    .leftJoin(traces, eq(evaluationResults.traceId, traces.id))
    .leftJoin(subQueryScoreCte, eq(evaluationResults.id, subQueryScoreCte.resultId))
    .where(and(...whereConditions))
    .orderBy(asc(evaluationResults.index), asc(evaluationResults.createdAt));

  const results = await getEvaluationResults;

  const result = {
    evaluation: evaluation,
    results,
  };

  return Response.json(result);
}
