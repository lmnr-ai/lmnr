import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteRenderTemplate, getRenderTemplate, updateRenderTemplate } from "@/lib/actions/render-template";

export async function GET(
  _request: Request,
  props: {
    params: Promise<{ projectId: string; templateId: string }>;
  }
) {
  try {
    const params = await props.params;
    const { projectId, templateId } = params;

    const template = await getRenderTemplate({ projectId, templateId });

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get template. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, props: { params: Promise<{ projectId: string; templateId: string }> }) {
  try {
    const params = await props.params;
    const { projectId, templateId } = params;
    const body = await request.json();

    const result = await updateRenderTemplate({
      projectId,
      templateId,
      name: body.name,
      code: body.code,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update template" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ projectId: string; templateId: string }> }) {
  try {
    const params = await props.params;
    const { projectId, templateId } = params;

    const result = await deleteRenderTemplate({ projectId, templateId });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete template" },
      { status: 500 }
    );
  }
}
