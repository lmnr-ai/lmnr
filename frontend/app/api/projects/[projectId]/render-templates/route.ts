import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createRenderTemplate } from "@/lib/actions/render-template";
import { getRenderTemplates } from "@/lib/actions/render-templates";

export async function GET(_req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId } = params;

    const templates = await getRenderTemplates({ projectId });

    return NextResponse.json(templates);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get templates. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  try {
    const params = await props.params;
    const { projectId } = params;
    const body = await req.json();

    const result = await createRenderTemplate({
      projectId,
      name: body.name,
      code: body.code,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template. Please try again." },
      { status: 500 }
    );
  }
}
