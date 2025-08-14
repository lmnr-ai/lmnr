import { prettifyError, ZodError } from "zod/v4";

import { updateQueueAnnotationSchema } from "@/lib/actions/queue";

export async function PUT(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  try {
    const body = await request.json();

    const updatedQueue = await updateQueueAnnotationSchema({
      queueId: params.queueId,
      ...body,
    });

    return new Response(JSON.stringify(updatedQueue));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
