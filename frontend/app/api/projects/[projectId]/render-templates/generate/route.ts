import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { generateTemplate } from "@/lib/actions/render-template/generate";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  // Defense-in-depth auth gate (also enforced by proxy.ts middleware): this route
  // runs a billable LLM agent, so verify session + project membership before
  // invoking generation. 401/403 JSON, matching other project-scoped routes.
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

    const result = await generateTemplate({ ...body, projectId });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate template." },
      { status: 500 }
    );
  }
}
