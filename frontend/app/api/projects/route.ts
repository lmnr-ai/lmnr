import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { createProject } from "@/lib/actions/projects";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  try {
    const project = await createProject({
      name: body.name,
      workspaceId: body.workspaceId,
    });

    return Response.json(project);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
