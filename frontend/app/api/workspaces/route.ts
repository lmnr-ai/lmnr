import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createWorkspace, getWorkspaces } from "@/lib/actions/workspaces";

export async function GET(_req: NextRequest): Promise<Response> {
  try {
    const workspaces = await getWorkspaces();

    return Response.json(workspaces);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get workspaces. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const workspace = await createWorkspace(body);

    return Response.json(workspace);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: "Failed to create workspace. Please try again." }, { status: 500 });
  }
}
