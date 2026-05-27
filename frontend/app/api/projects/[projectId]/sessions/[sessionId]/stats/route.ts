import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSessionExtraStats } from "@/lib/actions/sessions/stats";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId, sessionId } = await props.params;

  try {
    const result = await getSessionExtraStats({ projectId, sessionId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session stats." },
      { status: 500 }
    );
  }
}
