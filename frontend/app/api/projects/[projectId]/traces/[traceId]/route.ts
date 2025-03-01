import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { traces } from '@/lib/db/migrations/schema';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = await db.query.traces.findFirst({
    where: and(eq(traces.id, traceId), eq(traces.projectId, projectId)),
  });

  if (!trace) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
  }

  return NextResponse.json(trace);
}
