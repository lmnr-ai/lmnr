import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { transferOwnership } from "@/lib/actions/workspace";

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = await req.json();

    await transferOwnership({
      workspaceId: params.workspaceId,
      newOwnerEmail: body.newOwnerEmail,
    });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to transfer ownership.",
      },
      { status: 500 }
    );
  }
}
