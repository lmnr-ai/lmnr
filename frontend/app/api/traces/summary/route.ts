import { observe } from '@lmnr-ai/lmnr';
import { prettifyError } from 'zod/v4';

import { checkTraceEligibility } from '@/lib/actions/project/trace-eligibility';
import { executeQuery } from '@/lib/actions/sql';
import { generateTraceSummary } from '@/lib/actions/trace/agent';
import { GenerateTraceSummaryRequestSchema } from '@/lib/actions/trace/agent/summary';

/**
 * Internal endpoint for trace summary generation.
 * This endpoint is called by the Rust backend workers and is not exposed publicly.
 */
export async function POST(req: Request) {
  const body = await req.json();

  const traceSummaryResult = GenerateTraceSummaryRequestSchema.safeParse(body);

  if (!traceSummaryResult.success) {
    console.error('Validation error for trace summary request:', prettifyError(traceSummaryResult.error));
    return Response.json({ error: prettifyError(traceSummaryResult.error) }, { status: 400 });
  }

  // sleep for 0.5 seconds to account for time it takes to save spans to ClickHouse
  await new Promise((resolve) => setTimeout(resolve, 500));

  const { projectId, traceId } = traceSummaryResult.data;

  try {
    // Check if project is eligible for trace summary generation
    const eligibilityResult = await checkTraceEligibility({ projectId });

    if (!eligibilityResult.isEligible) {
      return Response.json({
        success: true,
        message: `Skipped - ${eligibilityResult.reason}`
      });
    }

    // check if the trace contains at least one LLM span
    const llmSpanCheckQuery = `
     SELECT COUNT(*) as llm_span_count
     FROM spans 
     WHERE trace_id = {traceId: UUID} 
     AND span_type = 'LLM'
     LIMIT 1
   `;

    const llmSpanResult = await executeQuery<{ llm_span_count: number }>({
      projectId,
      query: llmSpanCheckQuery,
      parameters: {
        traceId,
      }
    });

    const hasLlmSpans = llmSpanResult.length > 0 && llmSpanResult[0].llm_span_count > 0;

    if (!hasLlmSpans) {
      return Response.json({
        success: true,
        message: "Skipped - trace contains no LLM spans"
      });
    }

    // Generate the trace summary since all requirements are met
    // Disable retries for this call since we want to fail fast if the summary generation fails
    await observe({ name: "generateTraceSummaryIfNeeded" }, async () => await generateTraceSummary({
      ...traceSummaryResult.data,
      maxRetries: 0,
    }));

    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to generate trace summary:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate trace summary." },
      { status: 500 }
    );
  }
}
