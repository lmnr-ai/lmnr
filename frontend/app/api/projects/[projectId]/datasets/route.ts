import { and, desc, eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { clickhouseClient } from '@/lib/clickhouse/client';
import { DatasetInfo } from '@/lib/dataset/types';
import { db } from '@/lib/db/drizzle';
import { datasets } from '@/lib/db/migrations/schema';
import { paginatedGet } from '@/lib/db/utils';

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
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

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
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
    orderBy: [desc(datasets.createdAt)],
  });

  const datasetIds = datasetsData.items.map(dataset => (dataset as DatasetInfo).id);

  const chResult = await clickhouseClient.query({
    query: `
      SELECT dataset_id, COUNT(*) as count
      FROM dataset_datapoints
      WHERE project_id = {projectId: UUID}
      AND dataset_id IN {datasetIds: Array(UUID)}
      GROUP BY dataset_id
    `,
    format: 'JSONEachRow',
    query_params: {
      projectId,
      datasetIds
    }
  });

  const chResultJson = await chResult.json();

  const datapointCounts = Object.fromEntries(
    chResultJson.map((row: any) => [row.dataset_id, row.count])
  );

  const items = datasetsData.items.map((dataset: any) => ({
    ...dataset,
    datapointsCount: parseInt(datapointCounts[dataset.id] ?? '0')
  })) as DatasetInfo[];

  return new Response(JSON.stringify({
    ...datasetsData,
    items
  }), { status: 200 });
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
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
