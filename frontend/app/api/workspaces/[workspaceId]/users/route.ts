import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getWorkspaceUsers } from "@/lib/actions/workspace";

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const users = await getWorkspaceUsers({ workspaceId: params.workspaceId });

    return Response.json(users);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: "Failed to get workspace users. Please try again." }, { status: 500 });
  }
}
