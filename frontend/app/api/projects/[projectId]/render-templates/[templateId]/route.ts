import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { renderTemplates } from "@/lib/db/migrations/schema";

export async function GET(
  request: Request,
  props: {
    params: Promise<{ projectId: string, templateId: string }>
  }) {
  const params = await props.params;
  const { projectId, templateId } = params;
  const template = await db.query.renderTemplates.findFirst({
    where: and(
      eq(renderTemplates.id, templateId),
      eq(renderTemplates.projectId, projectId)
    )
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function POST(
  request: Request,
  props: { params: Promise<{ projectId: string, templateId: string }> }
) {
  const params = await props.params;
  const { projectId, templateId } = params;
  const body = await request.json();

  const template = await db.update(renderTemplates).set({
    name: body.name,
    code: body.code
  })
    .where(and(eq(renderTemplates.id, templateId), eq(renderTemplates.projectId, projectId)))
    .returning();

  if (!template.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json(template[0]);
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ projectId: string, templateId: string }> }
) {
  const params = await props.params;
  const { projectId, templateId } = params;
  const template = await db.delete(renderTemplates)
    .where(and(
      eq(renderTemplates.id, templateId),
      eq(renderTemplates.projectId, projectId)
    ))
    .returning();

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json(template);
}
