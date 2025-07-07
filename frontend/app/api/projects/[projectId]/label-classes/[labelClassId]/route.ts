import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { labelClasses } from '@/lib/db/migrations/schema';


export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; labelClassId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const labelClassId = params.labelClassId;

  const body = await req.json();

  const result = await db.update(labelClasses).set({
    name: body.name,
    color: body.color,
  }).where(
    and(eq(labelClasses.id, labelClassId), eq(labelClasses.projectId, projectId))
  ).returning();

  if (result.length === 0) {
    return new Response('Label class not found', { status: 404 });
  }

  return new Response(JSON.stringify(result[0]), { status: 200 });
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; labelClassId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const labelClassId = params.labelClassId;

  const affectedRows = await db.delete(labelClasses).where(
    and(
      eq(labelClasses.id, labelClassId),
      eq(labelClasses.projectId, projectId)
    )
  ).returning();

  if (affectedRows.length === 0) {
    return new Response('Label class not found', { status: 404 });
  }

  return new Response(null, { status: 200 });
}
