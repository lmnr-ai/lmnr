import { and, desc, eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { labelingQueues } from '@/lib/db/migrations/schema';
import { paginatedGet } from '@/lib/db/utils';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;



  const body = await req.json();
  const { name } = body;

  const queue = await db.insert(labelingQueues).values({
    name,
    projectId
  }).returning().then(res => res[0]);

  if (!queue) {
    return new Response(JSON.stringify({ error: "Failed to create queue" }), { status: 500 });
  }

  return new Response(JSON.stringify(queue), { status: 200 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;



  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;

  const filters = [eq(labelingQueues.projectId, projectId)];

  const queuesData = await paginatedGet({
    table: labelingQueues,
    pageNumber,
    pageSize,
    filters,
    orderBy: desc(labelingQueues.createdAt),
  });

  return new Response(JSON.stringify(queuesData), { status: 200 });
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;



  const { searchParams } = new URL(req.url);
  const queueIds = searchParams.get('queueIds')?.split(',');

  if (!queueIds) {
    return new Response('At least one Queue ID is required', { status: 400 });
  }

  try {
    await db.delete(labelingQueues)
      .where(
        and(
          inArray(labelingQueues.id, queueIds),
          eq(labelingQueues.projectId, projectId)
        )
      );

    return new Response('queues deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting queues:', error);
    return new Response('Error deleting queues', { status: 500 });
  }
}
