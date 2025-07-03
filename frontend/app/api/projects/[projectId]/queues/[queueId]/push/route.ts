import { pushQueueItems, PushQueueItemsRequestSchema } from "@/lib/actions/queue";

export async function POST(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  try {
    const body = await request.json();
    const result = PushQueueItemsRequestSchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: "Invalid request body", details: result.error }, { status: 400 });
    }

    const newQueueItems = await pushQueueItems({
      queueId: params.queueId,
      items: result.data,
    });

    return Response.json(newQueueItems);
  } catch (error) {
    console.error("Error pushing queue items:", error);
    if (error instanceof Error && error.message === "Failed to push items to queue") {
      return Response.json({ error: "Failed to push items to queue" }, { status: 500 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
