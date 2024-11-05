import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';
import { db } from '@/lib/db/drizzle';
import {
  evaluationResults,
  evaluations,
  evaluationScores
} from '@/lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; evaluationId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(
      JSON.stringify({ error: 'User is not a member of the project' }),
      { status: 403 }
    );
  }

  const getEvaluation = db
    .select()
    .from(evaluations)
    .where(
      and(
        eq(evaluations.id, evaluationId),
        eq(evaluations.projectId, projectId)
      )
    );

  const subQueryScoreCte = db.$with('scores').as(
    db
      .select({
        resultId: evaluationScores.resultId,
        scores: sql`jsonb_object_agg(${evaluationScores.name}, ${evaluationScores.score})`
      })
      .from(evaluationScores)
      .groupBy(evaluationScores.resultId)
  );

  const getEvaluationResults = db
    .select({
      id: evaluationResults.id,
      createdAt: evaluationResults.createdAt,
      evaluationId: evaluationResults.evaluationId,
      data: evaluationResults.data,
      target: evaluationResults.target,
      executorOutput: evaluationResults.executorOutput,
      scores: subQueryScoreCte.scores,
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
    evaluation: evaluation[0],
    results
  };

  return Response.json(result);
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; evaluationId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(`/projects/${projectId}/evaluations/${evaluationId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });
}
