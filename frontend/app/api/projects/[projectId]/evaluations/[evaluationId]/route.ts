import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  evaluationResults,
  evaluations,evaluationScores
} from '@/lib/db/migrations/schema';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; evaluationId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

  const getEvaluation = db.query.evaluations.findFirst({
    where: and(
      eq(evaluations.id, evaluationId),
      eq(evaluations.projectId, projectId)
    )
  });

  const subQueryScoreCte = db.$with('scores').as(
    db
      .select({
        resultId: evaluationScores.resultId,
        cteScores:
          sql`jsonb_object_agg(${evaluationScores.name}, ${evaluationScores.score})`.as(
            'cte_scores'
          )
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
      data: evaluationResults.data,
      target: evaluationResults.target,
      executorOutput: evaluationResults.executorOutput,
      scores: subQueryScoreCte.cteScores,
      traceId: evaluationResults.traceId
    })
    .from(evaluationResults)
    .leftJoin(
      subQueryScoreCte,
      eq(evaluationResults.id, subQueryScoreCte.resultId)
    )
    .where(eq(evaluationResults.evaluationId, evaluationId))
    .orderBy(
      asc(evaluationResults.createdAt),
      asc(evaluationResults.indexInBatch)
    );

  const [evaluation, results] = await Promise.all([
    getEvaluation,
    getEvaluationResults
  ]);

  const result = {
    evaluation: evaluation,
    results
  };

  return Response.json(result);
}
