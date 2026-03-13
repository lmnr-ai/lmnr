import { prettifyError, ZodError } from "zod/v4";

import { inviteUserToWorkspace } from "@/lib/actions/workspace/invite";

export async function POST(req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = (await req.json()) as { email: string };

    await inviteUserToWorkspace({
      workspaceId: params.workspaceId,
      ...body,
    });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to send invitation. Please try again." },
      { status: 500 }
    );
  }
}
