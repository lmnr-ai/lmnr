// Returns span basic info that is shown in the traces table
// when traces arrive realtime

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { spans } from '@/lib/db/migrations/schema';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const spanId = params.spanId;


  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.projectId, projectId)),
    columns: {
      spanType: true,
      name: true,
      inputPreview: true,
      outputPreview: true,
    }
  });

  return NextResponse.json(span);
}
