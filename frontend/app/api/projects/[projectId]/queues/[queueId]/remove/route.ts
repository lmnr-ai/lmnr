import { isCurrentUserMemberOfProject } from '@/lib/db/utils';
import { db } from '@/lib/db/drizzle';
import { labelingQueueItems, labels, evaluationScores, labelingQueues } from '@/lib/db/migrations/schema';
import { eq, and } from 'drizzle-orm';


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
