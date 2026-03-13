import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { switchTier } from "@/lib/actions/checkout";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    const body = await req.json();
    await switchTier({ workspaceId, tier: body.tier });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Failed to switch tier." }, { status: 500 });
  }
}
