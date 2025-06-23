import { removeQueueItem, RemoveQueueItemRequestSchema } from "@/lib/actions/queue";

export async function POST(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  try {
    const body = await request.json();
    const result = RemoveQueueItemRequestSchema.safeParse(body);

    if (!result.success) {
      return new Response(JSON.stringify({ error: "Invalid request body", details: result.error }), {
        status: 400,
      });
    }

    const { id, data, target, metadata, datasetId, skip } = result.data;

    await removeQueueItem({
      queueId: params.queueId,
      id,
      skip,
      datasetId,
      data,
      target,
      metadata,
    });

    return new Response(JSON.stringify({ success: true }));
  } catch (error) {
    console.error("Error removing queue item:", error);
    if (error instanceof Error && error.message.includes("Invalid request parameters")) {
      return new Response(
        JSON.stringify({
          error: "Invalid request parameters",
        }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
