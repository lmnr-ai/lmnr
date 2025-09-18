import { observe } from '@lmnr-ai/lmnr';
import { prettifyError } from 'zod/v4';

import { generateTraceSummary, TraceSummarySchema } from '@/lib/actions/trace/agent/summary';

/**
 * Internal endpoint for trace summary generation.
 * This endpoint is called by the Rust backend workers and is not exposed publicly.
 */
export async function POST(req: Request) {
  const body = await req.json();

  const traceSummaryResult = TraceSummarySchema.safeParse(body);

  if (!traceSummaryResult.success) {
    console.error('Validation error for trace summary request:', prettifyError(traceSummaryResult.error));
    return Response.json({ error: prettifyError(traceSummaryResult.error) }, { status: 400 });
  }

  try {
    await observe({ name: "generateTraceSummary" }, async () => await generateTraceSummary(traceSummaryResult.data));

    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to generate trace summary:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate trace summary." },
      { status: 500 }
    );
  }
}
