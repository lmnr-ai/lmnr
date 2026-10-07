import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteLlmProfile, updateLlmProfile } from "@/lib/actions/llm-profiles";
import { AppServerError } from "@/lib/actions/llm-profiles/app-server";

type Params = { params: Promise<{ workspaceId: string; profileId: string }> };

export async function PUT(req: NextRequest, props: Params): Promise<Response> {
  try {
    const { workspaceId, profileId } = await props.params;
    const body = await req.json();
    const profile = await updateLlmProfile({ ...body, workspaceId, profileId });
    return Response.json(profile);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof AppServerError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update LLM profile." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, props: Params): Promise<Response> {
  try {
    const { workspaceId, profileId } = await props.params;
    await deleteLlmProfile({ workspaceId, profileId });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof AppServerError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete LLM profile." },
      { status: 500 }
    );
  }
}
