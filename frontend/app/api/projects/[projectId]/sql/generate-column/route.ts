import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { generateColumnSql } from "@/lib/actions/sql/generate-column";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  // Auth + project-membership gate. This route runs real ClickHouse queries and
  // spends LLM tokens, so without it any caller who guesses a project UUID could
  // trigger both. No app-level middleware covers `/api/projects/...`.
  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isUserMemberOfProject(projectId, userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();

    const result = await generateColumnSql({ ...body, projectId }, request.signal);

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate column." },
      { status: 500 }
    );
  }
}
