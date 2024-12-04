import { and, eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { datasetDatapoints } from '@/lib/db/migrations/schema';
import { fetcher } from '@/lib/utils';

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
    indexedOn: z.string().nullable()
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    console.error('Invalid request body', result.error);
    return new Response('Invalid request body', { status: 400 });
  }

  const { data, target, metadata, indexedOn } = result.data;

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

    if (indexedOn != null) {
      const session = await getServerSession(authOptions);
      const user = session!.user;
      await fetcher(
        `/projects/${params.projectId}/datasets/${datasetId}/datapoints/${datapointId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${user.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: updatedDatapoint[0].data,
            target: updatedDatapoint[0].target,
            metadata: updatedDatapoint[0].metadata,
            indexedOn
          })
        }
      );
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
