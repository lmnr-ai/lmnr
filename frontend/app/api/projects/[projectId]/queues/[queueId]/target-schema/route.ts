import { prettifyError, ZodError } from "zod/v4";

import { updateQueueTargetSchema } from "@/lib/actions/queue";

export async function PUT(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const { projectId, queueId } = await props.params;

  try {
    const body = await request.json();

    const updatedQueue = await updateQueueTargetSchema({
      queueId,
      projectId,
      targetSchema: body?.targetSchema ?? null,
    });

    return Response.json(updatedQueue);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
