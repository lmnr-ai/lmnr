import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createSqlTemplate, getSqlTemplates } from "@/lib/actions/sql/templates";

export async function GET(_req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId } = params;

    const result = await getSqlTemplates({ projectId });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get SQL templates" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await props.params;

    const body = await req.json();

    const template = await createSqlTemplate({
      ...body,
      projectId,
    });

    return Response.json(template);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create SQL template." },
      { status: 500 }
    );
  }
}
