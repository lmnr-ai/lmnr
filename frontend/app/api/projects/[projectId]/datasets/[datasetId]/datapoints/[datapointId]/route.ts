import { db } from '@/lib/db/drizzle';
import { datasetDatapoints } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';

export async function POST(
  req: Request,
  {
    params
  }: { params: { projectId: string; datasetId: string; datapointId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  if (!await isCurrentUserMemberOfProject(projectId)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const datasetId = params.datasetId;
  const datapointId = params.datapointId;

  const body = await req.json();

  const schema = z.object({
    data: z.record(z.unknown()),
    target: z.record(z.unknown()).nullable(),
    metadata: z.record(z.unknown()).nullable(),
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
