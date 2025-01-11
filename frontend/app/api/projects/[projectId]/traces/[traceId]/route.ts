import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { traces } from '@/lib/db/migrations/schema';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  return fetcher(`/projects/${projectId}/traces/${traceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; traceId: string } }
): Promise<Response> {
  const { projectId, traceId } = params;

  try {
    const result = await db.delete(traces).where(eq(traces.id, traceId));

    if (result.count === 0) {
      return new Response(JSON.stringify({ error: 'Trace not found or already deleted.' }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify({ message: 'Trace deleted successfully.' }), {
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
    });
  }
}
