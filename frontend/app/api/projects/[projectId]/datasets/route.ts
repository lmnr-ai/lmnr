import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { datasets } from '@/lib/db/migrations/schema';

import { eq, inArray } from 'drizzle-orm';
import { and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  const res = await fetcher(`/projects/${projectId}/datasets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });

  return new Response(res.body);
}

export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/projects/${projectId}/datasets`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  return new Response(res.body);
}


export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;



  const { searchParams } = new URL(req.url);
  const datasetIds = searchParams.get('datasetIds')?.split(',');

  if (!datasetIds) {
    return new Response('At least one Dataset ID is required', { status: 400 });
  }

  try {
    await db.delete(datasets)
      .where(
        and(
          inArray(datasets.id, datasetIds),
          eq(datasets.projectId, projectId)
        )
      );

    return new Response('datasets deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting datasets:', error);
    return new Response('Error deleting datasets', { status: 500 });
  }
}
