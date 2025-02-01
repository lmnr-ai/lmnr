import { and, asc, eq, sql } from 'drizzle-orm';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import Evaluation from '@/components/evaluation/evaluation';
import { db } from '@/lib/db/drizzle';
import {
  evaluationResults,
  evaluations, evaluationScores
} from '@/lib/db/migrations/schema';
import { EvaluationResultsInfo } from '@/lib/evaluation/types';
import { Feature,isFeatureEnabled } from '@/lib/features/features';


export const metadata: Metadata = {
  title: 'Evaluation results'
};

export default async function EvaluationPage(
  props: {
    params: Promise<{ projectId: string; evaluationId: string }>;
  }
) {
  const params = await props.params;
  const evaluationInfo = await getEvaluationInfo(
    params.projectId,
    params.evaluationId
  );

  const evaluationsByGroupId = await db.query.evaluations.findMany({
    where: and(
      eq(evaluations.projectId, params.projectId),
      eq(evaluations.groupId, evaluationInfo.evaluation.groupId)
    )
  });

  return (
    <Evaluation
      evaluationInfo={evaluationInfo}
      evaluations={evaluationsByGroupId}
      isSupabaseEnabled={isFeatureEnabled(Feature.SUPABASE)}
    />
  );
}

async function getEvaluationInfo(
  projectId: string,
  evaluationId: string
): Promise<EvaluationResultsInfo> {
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
      data: sql<string>`SUBSTRING(${evaluationResults.data}::text, 0, 100)`.as('data'),
      target: sql<string>`SUBSTRING(${evaluationResults.target}::text, 0, 100)`.as('target'),
      executorOutput: evaluationResults.executorOutput,
      scores: subQueryScoreCte.cteScores,
      traceId: evaluationResults.traceId,
      index: evaluationResults.index
    })
    .from(evaluationResults)
    .leftJoin(
      subQueryScoreCte,
      eq(evaluationResults.id, subQueryScoreCte.resultId)
    )
    .where(eq(evaluationResults.evaluationId, evaluationId))
    .orderBy(
      asc(evaluationResults.index),
      asc(evaluationResults.createdAt)
    );

  const [evaluation, results] = await Promise.all([
    getEvaluation,
    getEvaluationResults
  ]);

  if (!evaluation) {
    redirect('/not-found');
  }

  const result = {
    evaluation: evaluation,
    results
  } as EvaluationResultsInfo;

  return result;
}
