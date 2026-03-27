import { addTraceTag, getTraceTags } from "@/lib/actions/tags";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;
  const projectId = params.projectId;

  const res = await getTraceTags({
    traceId,
    projectId,
  });

  return new Response(JSON.stringify(res), { status: 200 });
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const body = (await req.json()) as { name: string };

  const res = await addTraceTag({
    traceId,
    projectId,
    name: body.name,
  });
  return new Response(JSON.stringify(res), { status: 200 });
}
