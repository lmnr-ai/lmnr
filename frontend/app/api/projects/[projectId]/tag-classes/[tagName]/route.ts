import { and, eq } from 'drizzle-orm';
import { prettifyError, ZodError } from 'zod';

import { createOrUpdateTagClass } from '@/lib/actions/tags';
import { db } from '@/lib/db/drizzle';
import { tagClasses } from '@/lib/db/migrations/schema';


export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; tagName: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const tagName = params.tagName;
  const body = await req.json();

  try {
    const result = await createOrUpdateTagClass({
      projectId,
      name: tagName,
      color: body.color,
    });
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; tagName: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const tagName = params.tagName;

  const affectedRows = await db.delete(tagClasses).where(
    and(
      eq(tagClasses.name, tagName),
      eq(tagClasses.projectId, projectId)
    )
  ).returning();

  if (affectedRows.length === 0) {
    return new Response('Tag class not found', { status: 404 });
  }

  return new Response(null, { status: 200 });
}
