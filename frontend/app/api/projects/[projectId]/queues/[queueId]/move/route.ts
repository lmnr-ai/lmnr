import { moveQueueItem, MoveQueueRequestSchema } from "@/lib/actions/queue";

export async function POST(req: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  try {
    const body = await req.json();
    const parsedBody = MoveQueueRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { refDate, direction } = parsedBody.data;

    const result = await moveQueueItem({
      queueId: params.queueId,
      refDate,
      direction,
    });

    return Response.json(result || {});
  } catch (error) {
    console.error("Error moving queue item:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
