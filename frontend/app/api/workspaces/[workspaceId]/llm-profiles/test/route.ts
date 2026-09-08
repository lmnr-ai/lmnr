import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { AppServerError } from "@/lib/actions/llm-profiles/app-server";
import { testLlmProfile } from "@/lib/actions/llm-profiles/test";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  if (!isFeatureEnabled(Feature.LLM_PROFILES)) {
    return Response.json({ error: "LLM profiles are not available on Laminar Cloud" }, { status: 404 });
  }

  try {
    const { workspaceId } = await props.params;
    const body = await req.json();
    const result = await testLlmProfile({ ...body, workspaceId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof AppServerError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to test LLM profile." },
      { status: 500 }
    );
  }
}
