import { getTraceTags, setTraceTags } from "@/lib/actions/tags";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; tagName: string }> }
): Promise<Response> {
  try {
    const { projectId, traceId, tagName } = await props.params;

    const currentTags = await getTraceTags({ projectId, traceId });

    // Remove the tag
    const updatedTags = currentTags.filter((t) => t !== tagName);

    await setTraceTags({ projectId, traceId, tags: updatedTags });

    return new Response("Trace tag deleted successfully", { status: 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
