import { getSpanTags } from "@/lib/actions/tags";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; spanId: string }> }
): Promise<Response> {
  try {
    const { projectId, traceId, spanId } = await props.params;

    const res = await getSpanTags({
      projectId,
      traceId,
      spanId,
    });

    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
