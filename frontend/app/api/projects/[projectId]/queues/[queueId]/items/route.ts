import { getQueueProgress, listQueueItems } from "@/lib/actions/queue";

export async function GET(_req: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const { projectId, queueId } = await props.params;

  try {
    const [items, progress] = await Promise.all([
      listQueueItems({ projectId, queueId }),
      getQueueProgress({ projectId, queueId }),
    ]);
    return Response.json({ items, progress });
  } catch (error) {
    console.error("Error fetching queue items:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
