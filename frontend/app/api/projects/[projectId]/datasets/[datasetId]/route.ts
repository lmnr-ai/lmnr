import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { datasets } from '@/lib/db/migrations/schema';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId))
  });

  return new Response(JSON.stringify(dataset), { status: 200 });
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  await db.delete(datasets).where(and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)));

  return new Response('Dataset deleted successfully', { status: 200 });
}
