import { and, eq, inArray} from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { traces } from '@/lib/db/migrations/schema';
import { fetcher } from '@/lib/utils';

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const projectId = params.projectId;

  return await fetcher(
    `/projects/${projectId}/traces?${req.nextUrl.searchParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
}


export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string , traceId: string} }
): Promise<Response> {
  const projectId = params.projectId;

  const { searchParams } = new URL(req.url);
  const traceId = searchParams.get('traceId')?.split(',');

  if (!traceId) {
    return new Response('At least one Trace ID is required', { status: 400 });
  }

  try {
    await db.delete(traces)
      .where(
        and(
          inArray(traces.id, traceId),
          eq(traces.projectId, projectId)
        )
      );

    return new Response('Traces deleted successfully', { status: 200 });
  } catch (error) {
    return new Response('Error deleting traces', { status: 500 });
  }
}
