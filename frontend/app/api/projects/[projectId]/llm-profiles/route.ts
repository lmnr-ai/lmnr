import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { listProjectLlmProfileOptions } from "@/lib/actions/llm-profiles";

/** Picker payload for the signal form: the project's workspace profiles with their models. */
export async function GET(_req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await props.params;
    const options = await listProjectLlmProfileOptions({ projectId });
    return Response.json(options);
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
