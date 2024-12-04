import { and, asc, eq, sql } from 'drizzle-orm';
import { json2csv } from 'json-2-csv';

import { db } from '@/lib/db/drizzle';
import { evaluationResults, evaluations, evaluationScores } from '@/lib/db/migrations/schema';

export async function GET(
  req: Request,
  {
    params
  }: {
    params: { projectId: string; evaluationId: string; };
  }
): Promise<Response> {


  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

  const evaluation = await db.query.evaluations.findFirst({
    where: and(
      eq(evaluations.id, evaluationId),
      eq(evaluations.projectId, projectId)
    )
  });

  if (!evaluation) {
    return Response.json({ error: 'Evaluation not found' }, { status: 404 });
  }

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
    .where(eq(evaluationResults.evaluationId, evaluationId))
    .orderBy(
      asc(evaluationResults.createdAt),
      asc(evaluationResults.indexInBatch)
    );

  const flattenedResults = results.map(result => {
    const { scores, ...rest } = result;
    return {
      ...rest,
      ...scores
    };
  });
  const csv = await json2csv(flattenedResults, {
    emptyFieldValue: '',
    expandNestedObjects: false // we only expand the scores object manually
  });
  const contentType = 'text/csv';
  const filename = `${evaluation.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${evaluationId}.csv`;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(csv, {
    headers
  });
}
