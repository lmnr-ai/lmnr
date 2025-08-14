import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { updateRole } from "@/lib/actions/workspace";

export async function PATCH(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = await req.json();

    await updateRole({
      workspaceId: params.workspaceId,
      ...body,
    });

    return Response.json({ success: true, message: "User role updated successfully" });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update role. Please try again." },
      { status: 500 }
    );
  }
}
