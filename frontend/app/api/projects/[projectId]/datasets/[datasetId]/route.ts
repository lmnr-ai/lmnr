import { and, eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { datasets } from '@/lib/db/migrations/schema';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId))
  });

  return new Response(JSON.stringify(dataset), { status: 200 });
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/projects/${projectId}/datasets/${datasetId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  return new Response(res.body);
}
