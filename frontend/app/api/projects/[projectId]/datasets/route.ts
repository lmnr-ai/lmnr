import { and, desc, eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { datasets } from '@/lib/db/migrations/schema';
import { paginatedGet } from '@/lib/db/utils';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const body = await req.json();
  const { name } = body;

  const dataset = await db
    .insert(datasets)
    .values({
      name,
      projectId
    })
    .returning()
    .then((res) => res[0]);

  if (!dataset) {
    return new Response(JSON.stringify({ error: 'Failed to create dataset' }), {
      status: 500
    });
  }

  return new Response(JSON.stringify(dataset), { status: 200 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  const pageNumber =
    parseInt(req.nextUrl.searchParams.get('pageNumber') ?? '0') || 0;
  const pageSize =
    parseInt(req.nextUrl.searchParams.get('pageSize') ?? '50') || 50;
  const filters = [eq(datasets.projectId, projectId)];
  const datasetsData = await paginatedGet({
    table: datasets,
    pageNumber,
    pageSize,
    filters,
    orderBy: desc(datasets.createdAt)
  });

  return new Response(JSON.stringify(datasetsData), { status: 200 });
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
    await db
      .delete(datasets)
      .where(
        and(inArray(datasets.id, datasetIds), eq(datasets.projectId, projectId))
      );

    return new Response('datasets deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting datasets:', error);
    return new Response('Error deleting datasets', { status: 500 });
  }
}
