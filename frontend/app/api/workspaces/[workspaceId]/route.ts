import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteWorkspace, getWorkspace, updateWorkspace } from "@/lib/actions/workspace";

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const { workspaceId } = params;

  try {
    const body = await req.json();

    await updateWorkspace({ workspaceId, ...body });

    return Response.json({ message: "Workspace renamed successfully." });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update workspace." },
      { status: 500 }
    );
  }
}

export async function GET(_req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const workspace = await getWorkspace({ workspaceId: params.workspaceId });

    return Response.json(workspace);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: "Failed to get workspace. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const { workspaceId } = params;

  try {
    await deleteWorkspace({ workspaceId });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete workspace. Please try again." },
      { status: 500 }
    );
  }
}
