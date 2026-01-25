import { resolveSpanId } from '@/lib/actions/trace/agent/spans';

export async function GET(req: Request, props: { params: Promise<{ projectId: string, traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const url = new URL(req.url);
  const sequentialId = url.searchParams.get('id');

  if (!sequentialId || isNaN(parseInt(sequentialId, 10)) || parseInt(sequentialId, 10) <= 0) {
    return Response.json({ error: 'Invalid span ID' }, { status: 400 });
  }

  try {
    const spanUuid = await resolveSpanId(projectId, traceId, parseInt(sequentialId, 10));

    if (!spanUuid) {
      return Response.json({ error: 'Span not found' }, { status: 404 });
    }

    return Response.json({ spanId: spanUuid });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve span ID.' },
      { status: 500 }
    );
  }
}

