import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createRenderTemplate, getRenderTemplates } from "@/lib/actions/render-template";

export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId } = params;
    const type = new URL(req.url).searchParams.get("type") ?? undefined;

    // zod parse inside the action validates the raw query value
    const templates = await getRenderTemplates({ projectId, type: type as "span" | "trace" | undefined });

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
      type: body.type,
      whereClause: body.whereClause,
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
