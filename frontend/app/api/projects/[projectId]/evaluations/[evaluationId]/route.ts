import { and, asc, desc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations, evaluationScores, traces } from "@/lib/db/migrations/schema";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

  const defaultOrderBy = asc(evaluationResults.createdAt);

  const paramsOrderBy = req.nextUrl.searchParams.get("sort")?.split(":");

  const orderBy = paramsOrderBy
    ? paramsOrderBy[1] === "asc"
      ? asc(evaluationResults.index)
      : desc(evaluationResults.index)
    : defaultOrderBy;

  const getEvaluation = db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  const subQueryScoreCte = db.$with("scores").as(
    db
      .select({
        resultId: evaluationScores.resultId,
        cteScores: sql`jsonb_object_agg(${evaluationScores.name}, ${evaluationScores.score})`.as("cte_scores"),
      })
      .from(evaluationScores)
      .groupBy(evaluationScores.resultId)
  );

  const getEvaluationResults = db
    .with(subQueryScoreCte)
    .select({
      id: evaluationResults.id,
      createdAt: evaluationResults.createdAt,
      evaluationId: evaluationResults.evaluationId,
      data: sql<string>`SUBSTRING(${evaluationResults.data}::text, 0, 100)`.as("data"),
      target: sql<string>`SUBSTRING(${evaluationResults.target}::text, 0, 100)`.as("target"),
      executorOutput: evaluationResults.executorOutput,
      scores: subQueryScoreCte.cteScores,
      index: evaluationResults.index,
      traceId: evaluationResults.traceId,
      startTime: traces.startTime,
      endTime: traces.endTime,
      inputCost: traces.inputCost,
      outputCost: traces.outputCost,
    })
    .from(evaluationResults)
    .leftJoin(traces, eq(evaluationResults.traceId, traces.id))
    .leftJoin(subQueryScoreCte, eq(evaluationResults.id, subQueryScoreCte.resultId))
    .where(eq(evaluationResults.evaluationId, evaluationId))
    .orderBy(orderBy);

  const [evaluation, results] = await Promise.all([getEvaluation, getEvaluationResults]);

  const result = {
    evaluation: evaluation,
    results,
  };

  return Response.json(result);
}
