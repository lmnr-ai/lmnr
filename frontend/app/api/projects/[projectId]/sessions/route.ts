import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSessions, DeleteSessionsSchema, getSessions, GetSessionsSchema } from "@/lib/actions/sessions";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetSessionsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSessions({ ...parseResult.data, projectId });
    return Response.json({ items: result.items, totalCount: result.count });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sessions." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const sessionIds = req.nextUrl.searchParams.getAll("id");

  const parseResult = DeleteSessionsSchema.safeParse({
    projectId,
    sessionIds,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    await deleteSessions(parseResult.data);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete sessions." },
      { status: 500 }
    );
  }
}
