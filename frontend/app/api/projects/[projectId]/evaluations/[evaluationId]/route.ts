import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations, evaluationScores, traces } from "@/lib/db/migrations/schema";
import { DatatableFilter } from "@/lib/types";

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
    urlParamFilters = req.nextUrl.searchParams.getAll("filter").map((f) => JSON.parse(f) as DatatableFilter);
  } catch (e) {
    console.error("Error parsing filters:", e);
    return Response.json({ error: "Error parsing filters" }, { status: 400 });
  }

  // First, get the evaluation to extract its creation time
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    return Response.json({ error: "Evaluation not found" }, { status: 404 });
  }

  // Build all where conditions
  const whereConditions = [eq(evaluationResults.evaluationId, evaluationId)];

  // Extract metadata filters
  const metadataFilters = urlParamFilters
    .filter((filter) => filter.column === "metadata" && filter.operator === "eq")
    .map((filter) => {
      const [key, value] = filter.value.split(/=(.*)/);
      return sql`${evaluationResults.metadata} @> ${JSON.stringify({ [key]: value })}`;
    });

  whereConditions.push(...metadataFilters);

  // span search
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
          end: endTime,
        },
        searchType: spanSearchTypes,
      });

      searchTraceIds = Array.from(result.traceIds);

      whereConditions.push(inArray(evaluationResults.traceId, searchTraceIds));
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

  // Duration expression (in seconds)
  const durationExpr = sql`EXTRACT(EPOCH FROM (${traces.endTime} - ${traces.startTime}))`;

  // Total cost expression
  const costExpr = sql`(COALESCE(${traces.inputCost}, 0) + COALESCE(${traces.outputCost}, 0))`;

  // Add filter conditions
  urlParamFilters
    .filter((filter) => filter.column !== "metadata") // Skip metadata filters as they're handled separately
    .forEach((filter) => {
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
          const numValue = parseFloat(value);
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
      } else if (column.startsWith("score:")) {
        const scoreName = column.split(":")[1];
        const numValue = parseFloat(value);

        if (scoreName && !isNaN(numValue)) {
          const opMap: Record<string, string> = {
            gt: ">",
            gte: ">=",
            lt: "<",
            lte: "<=",
            eq: "=",
            ne: "!=",
          };

          const opSymbol = opMap[operator] || "=";

          whereConditions.push(
            sql`${evaluationResults.id} IN (
                    SELECT ${evaluationScores.resultId}
                    FROM   ${evaluationScores}
                    WHERE  ${evaluationScores.name} = ${scoreName}
                    AND    ${evaluationScores.score} ${sql.raw(opSymbol)} ${numValue}
                  )`
          );
        }
      } else {
        // Default text search for ID
        whereConditions.push(sql`${evaluationResults.id}::text ILIKE ${"%" + value + "%"}`);
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
      outputCost: traces.outputCost,
      metadata: evaluationResults.metadata,
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

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, evaluationId } = params;
  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim() === "") {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(evaluations)
    .set({ name })
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)))
    .returning();

  if (!updated) {
    return Response.json({ error: "Evaluation not found" }, { status: 404 });
  }

  return Response.json(updated);
}
