import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { removeUserFromWorkspace } from "@/lib/actions/workspace";

export async function DELETE(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const userId = req.nextUrl.searchParams.get("id");

  if (!userId) {
    return new Response("No user id was provided", { status: 400 });
  }

  try {
    await removeUserFromWorkspace({ workspaceId: params.workspaceId, userId });
    return new Response("User removed successfully.", { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }

    return new Response(error instanceof Error ? error.message : "Failed to remove user", { status: 500 });
  }
}
