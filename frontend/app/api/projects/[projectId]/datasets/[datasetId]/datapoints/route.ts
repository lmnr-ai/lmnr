import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { datasetDatapoints } from '@/lib/db/schema';
import { and, inArray, eq } from 'drizzle-orm';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';

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

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  return await fetcher(
    `/projects/${projectId}/datasets/${datasetId}/datapoints`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      },
      body: JSON.stringify(body)
    }
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; datasetId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

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
