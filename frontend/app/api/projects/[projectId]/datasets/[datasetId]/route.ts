import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { db } from '@/lib/db/drizzle';
import { and, eq } from 'drizzle-orm';
import { datasets } from '@/lib/db/migrations/schema';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const body = await req.json();
  const { name } = body;

  try {
    const dataset = await db
      .update(datasets)
      .set({
        name
      })
      .where(and(eq(datasets.projectId, projectId), eq(datasets.id, datasetId)))
      .returning();

    if (dataset.length === 0) {
      return new Response(JSON.stringify({ error: 'Dataset not found' }), {
        status: 404
      });
    }
    return new Response(JSON.stringify(dataset[0]), { status: 200 });
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
}

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
