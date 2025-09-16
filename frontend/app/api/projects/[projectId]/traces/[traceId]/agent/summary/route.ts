import { observe } from '@lmnr-ai/lmnr';
import { prettifyError } from 'zod/v4';

import { generateTraceSummary, TraceSummarySchema } from '@/lib/actions/trace/agent/summary';

export async function POST(req: Request, props: { params: Promise<{ projectId: string, traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const { traceStartTime, traceEndTime }: {
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
    const { summary, spanIdsMap } = await observe({ name: "generateTraceSummary" }, async () => await generateTraceSummary(parseResult.data));
    return Response.json({
      summary,
      spanIdsMap,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate trace summary." },
      { status: 500 }
    );
  }
}
