import { NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { deleteSqlTemplate, updateSqlTemplate } from "@/lib/actions/sql/templates";

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; templateId: string }> }
): Promise<Response> {
  try {
    const { projectId, templateId } = await props.params;

    const body = await req.json();

    const updatedTemplate = await updateSqlTemplate({
      projectId,
      templateId,
      ...body,
    });

    return Response.json(updatedTemplate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: prettifyError(error), details: error.issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; templateId: string }> }
): Promise<Response> {
  try {
    const { projectId, templateId } = await props.params;

    await deleteSqlTemplate({
      projectId,
      templateId,
    });

    return Response.json({ message: "SQL template deleted successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: prettifyError(error), details: error.issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
