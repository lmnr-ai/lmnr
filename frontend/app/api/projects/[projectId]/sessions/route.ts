import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSessions, getSessions, GetSessionsSchema } from "@/lib/actions/sessions";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";

async function assertProjectMember(projectId: string): Promise<Response | null> {
  // No app-level middleware covers `/api/projects/...`; gate each handler.
  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isUserMemberOfProject(projectId, userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const denied = await assertProjectMember(projectId);
  if (denied) return denied;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetSessionsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const retentionError = await checkDataRetentionAccess(projectId, {
    pastHours: parseResult.data.pastHours,
    startDate: parseResult.data.startDate,
  });
  if (retentionError) {
    return retentionError;
  }

  try {
    const result = await getSessions({ ...parseResult.data, projectId });
    return Response.json(result);
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

  const denied = await assertProjectMember(projectId);
  if (denied) return denied;

  const sessionIds = req.nextUrl.searchParams.getAll("id");

  try {
    await deleteSessions({ projectId, sessionIds });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete sessions." },
      { status: 500 }
    );
  }
}
