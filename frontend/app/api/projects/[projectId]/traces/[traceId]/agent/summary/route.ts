import { observe } from '@lmnr-ai/lmnr';
import { prettifyError } from 'zod/v4';

import { generateOrGetTraceSummary, GenerateTraceSummaryRequestSchema } from '@/lib/actions/trace/agent/summary';

export async function POST(req: Request, props: { params: Promise<{ projectId: string, traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const parseResult = GenerateTraceSummaryRequestSchema.safeParse({
    traceId,
    projectId,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const { summary, status, analysis, analysisPreview, spanIdsMap } = await observe({ name: "generateTraceSummary" }, async () => await generateOrGetTraceSummary(parseResult.data));
    return Response.json({
      summary,
      status,
      analysis,
      analysisPreview,
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
