import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createLlmProfile, listLlmProfiles } from "@/lib/actions/llm-profiles";
import { AppServerError } from "@/lib/actions/llm-profiles/app-server";

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const { workspaceId } = await props.params;
    const profiles = await listLlmProfiles({ workspaceId });
    return Response.json(profiles);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list LLM profiles." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const { workspaceId } = await props.params;
    const body = await req.json();
    const profile = await createLlmProfile({ ...body, workspaceId });
    return Response.json(profile, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof AppServerError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create LLM profile." },
      { status: 500 }
    );
  }
}
