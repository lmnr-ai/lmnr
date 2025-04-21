import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { Datapoint } from '@/lib/dataset/types';
import { db } from '@/lib/db/drizzle';
import { datapointToSpan, datasetDatapoints, datasets } from '@/lib/db/migrations/schema';
import { getDateRangeFilters, paginatedGet } from '@/lib/db/utils';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const datasetId = params.datasetId;
  const pastHours = req.nextUrl.searchParams.get("pastHours");
  const startTime = req.nextUrl.searchParams.get("startDate");
  const endTime = req.nextUrl.searchParams.get("endDate");
  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;
  const baseFilters = [eq(datasetDatapoints.datasetId, datasetId)];
  // don't query input and output, only query previews
  const { data, target, ...rest } = getTableColumns(datasetDatapoints);
  const customColumns = {
    data: sql<string>`SUBSTRING(data::text, 0, 100)`.as("data"),
    target: sql<string>`SUBSTRING(target::text, 0, 100)`.as("target"),
  };

  const datapointsData = await paginatedGet<any, Datapoint>({
    table: datasetDatapoints,
    pageNumber,
    pageSize,
    filters: [...baseFilters, ...getDateRangeFilters(startTime, endTime, pastHours)],
    orderBy: [desc(datasetDatapoints.createdAt), desc(datasetDatapoints.indexInBatch)],
    columns: {
      ...rest,
      ...customColumns,
    },
  });

  return NextResponse.json(datapointsData);
}

const CreateDatapointsSchema = z.object({
  datapoints: z.array(z.object({
    data: z.unknown(),
    target: z.any().optional(),
    metadata: z.any().optional(),
  })),
  sourceSpanId: z.string().optional(),
});

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const body = await req.json();

  // Validate request body
  const parseResult = CreateDatapointsSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request body",
        details: parseResult.error.issues
      }),
      { status: 400 }
    );
  }

  const { datapoints, sourceSpanId } = parseResult.data;

  const res = await db.insert(datasetDatapoints).values(
    datapoints.map((datapoint) => ({
      ...datapoint,
      data: datapoint.data,
      createdAt: new Date().toUTCString(),
      datasetId
    }))
  ).returning();

  if (sourceSpanId && res.length > 0) {
    await db.insert(datapointToSpan).values(
      res.map((datapoint) => ({
        spanId: sourceSpanId,
        datapointId: datapoint.id,
        projectId,
      }))
    ).returning();
  }

  if (res.length === 0) {
    return new Response('Error creating datasetDatapoints', { status: 500 });
  }

  return new Response('datasetDatapoints created successfully', { status: 200 });
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const { searchParams } = new URL(req.url);
  const datapointIds = searchParams.get('datapointIds')?.split(',');

  if (!datapointIds) {
    return new Response('At least one Datapoint ID is required', { status: 400 });
  }

  try {
    await db.delete(datasetDatapoints)
      .where(
        and(
          inArray(datasetDatapoints.id, datapointIds),
          eq(datasetDatapoints.datasetId, datasetId)
        )
      );
    return new Response('datasetDatapoints deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting datasetDatapoints:', error);
    return new Response('Error deleting datasetDatapoints', { status: 500 });
  }
}
