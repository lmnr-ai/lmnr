import { prettifyError, ZodError } from "zod/v4";

import { pushQueueItems } from "@/lib/actions/queue";

export async function POST(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  try {
    const body = await request.json();
    const newQueueItems = await pushQueueItems({
      queueId: params.queueId,
      items: body,
    });

    return Response.json(newQueueItems);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : '"Failed to push items to queue" Please try again.' },
      { status: 500 }
    );
  }
}
