import { getTraceTags, setTraceTags } from "@/lib/actions/tags";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  try {
    const { projectId, traceId } = await props.params;

    const tags = await getTraceTags({ projectId, traceId });

    return Response.json(tags);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  try {
    const { projectId, traceId } = await props.params;
    const body = (await req.json()) as { tagName: string };
    const { tagName } = body;

    if (!tagName || typeof tagName !== "string") {
      return Response.json({ error: "tagName is required" }, { status: 400 });
    }

    const currentTags = await getTraceTags({ projectId, traceId });

    // Add the new tag (deduplicate)
    const updatedTags = [...new Set([...currentTags, tagName])];

    await setTraceTags({ projectId, traceId, tags: updatedTags });

    return Response.json(updatedTags);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
