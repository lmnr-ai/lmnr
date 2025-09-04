import { generateTraceSummary, TraceSummarySchema } from '@/lib/actions/trace/chat/summary';
import { prettifyError } from 'zod/v4';

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const { traceId, traceStartTime, traceEndTime }: {
    traceId: string,
    traceStartTime: string,
    traceEndTime: string
  } = await req.json();

  const parseResult = TraceSummarySchema.safeParse({
    traceId,
    traceStartTime,
    traceEndTime,
    projectId,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await generateTraceSummary(parseResult.data);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate trace summary." },
      { status: 500 }
    );
  }
}