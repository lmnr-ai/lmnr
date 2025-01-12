import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { renderTemplates } from '@/lib/db/migrations/schema';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const templates = await db.query.renderTemplates.findMany({
    where: eq(renderTemplates.projectId, projectId),
    columns: {
      id: true,
      name: true,
    }
  });

  return NextResponse.json(templates);
}


export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const projectId = params.projectId;
  const body = await req.json();

  const result = await db.insert(renderTemplates).values({
    projectId,
    name: body.name,
    code: body.code
  }).returning();

  if (!result) {
    return new Response('Failed to create template', { status: 500 });
  }

  return new Response(JSON.stringify(result[0]));
}
