import { addSpanTag, getSpanTags } from "@/lib/actions/tags";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const spanId = params.spanId;
    const projectId = params.projectId;

    const res = await getSpanTags({
      spanId,
      projectId,
    });

    return new Response(JSON.stringify(res), { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch span tags" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const projectId = params.projectId;
    const spanId = params.spanId;

    const body = (await req.json()) as { name: string };

    const res = await addSpanTag({
      spanId,
      projectId,
      name: body.name,
    });
    return new Response(JSON.stringify(res), { status: 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to add span tag" }, { status: 500 });
  }
}
