import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { tagClasses } from '@/lib/db/migrations/schema';


export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; tagClassId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const tagClassId = params.tagClassId;

  const body = await req.json();

  const result = await db.update(tagClasses).set({
    name: body.name,
    color: body.color,
  }).where(
    and(eq(tagClasses.id, tagClassId), eq(tagClasses.projectId, projectId))
  ).returning();

  if (result.length === 0) {
    return new Response('Tag class not found', { status: 404 });
  }

  return Response.json(result[0], { status: 200 });
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; tagClassId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const tagClassId = params.tagClassId;

  const affectedRows = await db.delete(tagClasses).where(
    and(
      eq(tagClasses.id, tagClassId),
      eq(tagClasses.projectId, projectId)
    )
  ).returning();

  if (affectedRows.length === 0) {
    return new Response('Tag class not found', { status: 404 });
  }

  return new Response(null, { status: 200 });
}
