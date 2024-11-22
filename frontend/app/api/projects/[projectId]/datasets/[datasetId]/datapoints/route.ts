import { and, eq, inArray } from 'drizzle-orm';
import { datapointToSpan, datasetDatapoints } from '@/lib/db/migrations/schema';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { fetcher } from '@/lib/utils';
import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { z } from 'zod';

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(
    `/projects/${projectId}/datasets/${datasetId}/datapoints?${req.nextUrl.searchParams.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
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
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
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
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
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
