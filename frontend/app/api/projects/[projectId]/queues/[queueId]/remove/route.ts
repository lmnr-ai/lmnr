
import { and, eq, sql } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { clickhouseClient } from '@/lib/clickhouse/client';
import { dateToNanoseconds } from '@/lib/clickhouse/utils';
import { db } from '@/lib/db/drizzle';
import {
  datapointToSpan,
  datasetDatapoints,
  evaluationResults,
  evaluations,
  evaluationScores,
  labelingQueueItems,
  labels,
  spans
} from '@/lib/db/migrations/schema';
import { Feature, isFeatureEnabled } from '@/lib/features/features';


const removeQueueItemSchema = z.object({
  id: z.string(),
  spanId: z.string(),
  addedLabels: z.array(z.object({
    value: z.number(),
    labelClass: z.object({
      name: z.string(),
      id: z.string()
    }),
    reasoning: z.string().optional().nullable()
  })),
  action: z.object({
    resultId: z.string().optional(),
    datasetId: z.string().optional()
  })
});

// remove an item from the queue
export async function POST(request: Request, { params }: { params: { projectId: string; queueId: string } }) {

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await request.json();
  const result = removeQueueItemSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: 'Invalid request body', details: result.error }, { status: 400 });
  }

  const { id, spanId, addedLabels, action } = result.data;

  // adding new labels to the span
  const newLabels = addedLabels.map(({ value, labelClass, reasoning }) => ({
    value: value,
    classId: labelClass.id,
    spanId,
    reasoning,
    labelSource: "MANUAL" as const,
  }));

  const insertedLabels = await db.insert(labels).values(newLabels).onConflictDoUpdate({
    target: [labels.spanId, labels.classId, labels.userId],
    set: {
      value: sql`excluded.value`,
      labelSource: sql`excluded.label_source`,
      reasoning: sql`COALESCE(excluded.reasoning, labels.reasoning)`,
    }
  }).returning();

  if (action.resultId) {
    const resultId = action.resultId;
    const userName = user.name ? ` (${user.name})` : '';

    // create new results in batch
    const evaluationValues = insertedLabels.map(({ value, classId, id: labelId }) => {
      const labelClass = addedLabels.find(({ labelClass }) => labelClass.id === classId)?.labelClass;
      return {
        score: value ?? 0,
        name: `${labelClass?.name}${userName}`,
        resultId,
        labelId,
      };
    });

    await db.insert(evaluationScores).values(evaluationValues);

    if (isFeatureEnabled(Feature.FULL_BUILD)) {
      // TODO: optimize this query to use subquery instead of join.
      const matchingEvaluations = await db
        .select()
        .from(evaluations)
        .innerJoin(evaluationResults, eq(evaluationResults.evaluationId, evaluations.id))
        .where(and(
          eq(evaluationResults.id, resultId),
          eq(evaluations.projectId, params.projectId)
        ))
        .limit(1);

      if (matchingEvaluations.length > 0) {
        const evaluation = matchingEvaluations[0].evaluations;
        await clickhouseClient.insert({
          table: 'evaluation_scores',
          format: 'JSONEachRow',
          values: evaluationValues.map(value => ({
            project_id: params.projectId,
            group_id: evaluation.groupId,
            evaluation_id: evaluation.id,
            result_id: resultId,
            name: value.name,
            value: value.score,
            timestamp: dateToNanoseconds(new Date()),
            label_id: value.labelId,
          }))
        });
      }
    }
  }

  if (action.datasetId) {

    const span = await db.query.spans.findFirst({
      where: and(eq(spans.spanId, spanId), eq(spans.projectId, params.projectId))
    });

    if (!span) {
      return Response.json({ error: 'Span not found when adding to dataset' }, { status: 500 });
    }

    const datapoint = await db.insert(datasetDatapoints).values({
      data: span.input,
      target: span.output,
      metadata: {
        spanId: span.spanId,
      },
      datasetId: action.datasetId,
    }).returning();

    await db.insert(datapointToSpan).values({
      spanId: span.spanId,
      datapointId: datapoint[0].id,
      projectId: params.projectId,
    });

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
