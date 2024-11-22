import { and, eq } from 'drizzle-orm';

import { datasetDatapoints } from '@/lib/db/migrations/schema';
import { db } from '@/lib/db/drizzle';
import { z } from 'zod';

export async function POST(
  req: Request,
  {
    params
  }: { params: { projectId: string; datasetId: string; datapointId: string } }
): Promise<Response> {

  const datasetId = params.datasetId;
  const datapointId = params.datapointId;

  const body = await req.json();

  // This schema allows any JSON value for data and target,
  // but for file upload we will need to dump everything into data,
  // unless the keys match "data", "target", or "metadata"
  const schema = z.object({
    data: z.any(),
    target: z.any().nullable(),
    metadata: z.any().nullable(),
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    console.error('Invalid request body', result.error);
    return new Response('Invalid request body', { status: 400 });
  }

  const { data, target, metadata } = result.data;

  try {
    const updatedDatapoint = await db
      .update(datasetDatapoints)
      .set({
        data,
        target,
        metadata,
      })
      .where(
        and(
          eq(datasetDatapoints.id, datapointId),
          eq(datasetDatapoints.datasetId, datasetId)
        )
      )
      .returning();

    if (updatedDatapoint.length === 0) {
      return new Response('Datapoint not found', { status: 404 });
    }

    return new Response(JSON.stringify(updatedDatapoint[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating datapoint:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
