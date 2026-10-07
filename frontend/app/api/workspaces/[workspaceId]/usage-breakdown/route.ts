import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getUsageBreakdown } from "@/lib/actions/usage/usage-breakdown";

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const breakdown = await getUsageBreakdown({ workspaceId: params.workspaceId });
    return Response.json(breakdown);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get usage breakdown." },
      { status: 500 }
    );
  }
}
