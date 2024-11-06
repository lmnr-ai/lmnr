import { db } from '@/lib/db/drizzle';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';
import { asc, and, eq } from 'drizzle-orm';
import { evaluationResults, evaluations } from '@/lib/db/migrations/schema';
import { evaluationScores } from '@/lib/db/migrations/schema';
import { sql } from 'drizzle-orm';
import { json2csv } from 'json-2-csv';

export async function GET(
  req: Request,
  {
    params
  }: {
    params: { projectId: string; evaluationId: string; };
  }
): Promise<Response> {
  if (!(await isCurrentUserMemberOfProject(params.projectId))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

  const subQueryScoreCte = db.$with('scores').as(
    db
      .select({
        resultId: evaluationScores.resultId,
        cteScores: sql`jsonb_object_agg(${evaluationScores.name}, ${evaluationScores.score})`.as('cte_scores')
      })
      .from(evaluationScores)
      .groupBy(evaluationScores.resultId)
  );

  const results: Record<string, any>[] = await db
    .with(subQueryScoreCte)
    .select({
      id: evaluationResults.id,
      createdAt: evaluationResults.createdAt,
      data: evaluationResults.data,
      target: evaluationResults.target,
      executorOutput: evaluationResults.executorOutput,
      scores: subQueryScoreCte.cteScores,
    })
    .from(evaluationResults)
    .leftJoin(
      subQueryScoreCte,
      eq(evaluationResults.id, subQueryScoreCte.resultId)
    )
    .innerJoin(
      evaluations,
      and(
        eq(evaluationResults.evaluationId, evaluations.id),
        eq(evaluations.projectId, projectId)
      )
    )
    .where(eq(evaluationResults.evaluationId, evaluationId))
    .orderBy(
      asc(evaluationResults.createdAt),
      asc(evaluationResults.indexInBatch)
    );

  const flattenedResults = results.map(result => ({
    ...result,
    ...result.scores
  }));
  const csv = await json2csv(flattenedResults, {
    emptyFieldValue: '',
    expandNestedObjects: false // we only expand the scores object manually
  });
  const contentType = 'text/csv';
  const filename = `evaluation-results-${evaluationId}.csv`;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(csv, {
    headers
  });
}
