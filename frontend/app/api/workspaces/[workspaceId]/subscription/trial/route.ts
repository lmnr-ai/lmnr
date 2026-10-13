import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { startStarterTrial } from "@/lib/actions/checkout/trial";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    const result = await startStarterTrial({ workspaceId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to start the free trial." },
      { status: 500 }
    );
  }
}
