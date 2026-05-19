import { prettifyError, ZodError } from "zod/v4";

import { updateProjectRemovePii } from "@/lib/actions/project";

export async function PATCH(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const body = await req.json();
    await updateProjectRemovePii({ projectId, removePii: !!body?.removePii });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "PII redaction requires the Pro tier" ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
