import { isCurrentUserMemberOfProject } from '@/lib/db/utils';
import { db } from '@/lib/db/drizzle';
import { labelingQueueItems, labels, evaluationScores, labelingQueues, evaluations, evaluationResults } from '@/lib/db/migrations/schema';
import { eq, and } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/features/features';
import { Feature } from '@/lib/features/features';
import { clickhouseClient } from '@/lib/clickhouse/client';


// remove an item from the queue
export async function POST(request: Request, { params }: { params: { projectId: string; queueId: string } }) {
  if (!(await isCurrentUserMemberOfProject(params.projectId))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, spanId, action } = body;

  if (action.resultId) {
    const labelingQueue = await db.query.labelingQueues.findFirst({
      where: eq(labelingQueues.id, params.queueId)
    });

    // get all labels of the span
    // FIXME: this takes values from previous labels,
    // potentially from a different queue
    const labelsOfSpan = await db.query.labels.findMany({
      where: eq(labels.spanId, spanId),
      with: {
        labelClass: true
      }
    });

    const resultId = action.resultId;

    // create new results in batch
    const evaluationValues = labelsOfSpan.map(label => ({
      score: label.value ?? 0,
      name: `${label.labelClass.name}_${labelingQueue?.name}`,
      resultId,
    }));

    if (isFeatureEnabled(Feature.FULL_BUILD)) {
      const evaluation = await db.query.evaluations.findFirst({
        with: {
          evaluationResults: {
            where: eq(evaluationResults.id, resultId)
          }
        }
      });
      if (evaluation && evaluationValues.length > 0) {
        const result = await clickhouseClient.insert({
          table: 'evaluation_scores',
          format: 'JSONEachRow',
          values: evaluationValues.map(value => ({
            project_id: params.projectId,
            group_id: evaluation.groupId,
            evaluation_id: evaluation.id,
            result_id: resultId,
            name: value.name,
            value: value.score,
          }))
        });
      }
    }

    await db.insert(evaluationScores).values(evaluationValues);
  }

  const deletedQueueData = await db
    .delete(labelingQueueItems)
    .where(and(
      eq(labelingQueueItems.queueId, params.queueId),
      eq(labelingQueueItems.id, id)
    ))
    .returning();


  if (deletedQueueData.length === 0) {
    return Response.json({ error: 'No items in queue' }, { status: 404 });
  }

  return Response.json(deletedQueueData[0]);
}
