import { observe } from '@lmnr-ai/lmnr';
import { z } from 'zod';

import { clickhouseClient } from '@/lib/clickhouse/client';
import { tryParseJson } from '@/lib/utils';

export const GenerateTraceSummaryRequestSchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
});

const TraceSummarySchema = z.object({
  summary: z.string(),
  status: z.string(),
  analysis: z.string(),
  analysisPreview: z.string(),
  spanIdsMap: z.record(z.string(), z.string()),
});

export async function getTraceSummary(input: z.infer<typeof GenerateTraceSummaryRequestSchema>): Promise<z.infer<typeof TraceSummarySchema> | undefined> {
  const { traceId, projectId } = input;

  // Check ClickHouse for existing summary
  const result = await clickhouseClient.query({
    query: `
      SELECT 
        summary,
        status,
        analysis,
        analysis_preview as analysisPreview,
        span_ids_map as spanIdsMap
      FROM trace_summaries
      WHERE project_id = {projectId: UUID}
      AND trace_id = {traceId: UUID}
      LIMIT 1
    `,
    format: "JSONEachRow",
    query_params: {
      projectId,
      traceId,
    }
  });

  const data = await result.json<{
    summary: string;
    status: string;
    analysis: string;
    analysisPreview: string;
    spanIdsMap: string;
  }>();

  if (data.length > 0) {
    const summaryData = data[0];
    return {
      summary: summaryData.summary || "",
      status: summaryData.status || "",
      analysis: summaryData.analysis || "",
      analysisPreview: summaryData.analysisPreview || "",
      spanIdsMap: tryParseJson(summaryData.spanIdsMap) || {},
    };
  }

  return undefined;
}

export async function generateTraceSummary(input: z.infer<typeof GenerateTraceSummaryRequestSchema>): Promise<z.infer<typeof TraceSummarySchema>> {
  const { traceId, projectId } = input;

  const traceSummarizerUrl = process.env.TRACE_SUMMARIZER_URL;
  const authToken = process.env.TRACE_SUMMARIZER_SECRET_KEY;

  if (!traceSummarizerUrl) {
    throw new Error('TRACE_SUMMARIZER_URL environment variable is not set');
  }

  if (!authToken) {
    throw new Error('TRACE_SUMMARIZER_SECRET_KEY environment variable is not set');
  }

  // Call the external trace summarizer service
  const response = await observe({ name: "callTraceSummarizerService" }, async () => {
    const res = await fetch(traceSummarizerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: projectId,
        trace_id: traceId,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Trace summarizer service failed: ${res.status} ${errorText}`);
    }

    return res.json();
  });

  const { summary, status, analysis, analysisPreview, spanIdsMap } = response;

  return {
    summary,
    status,
    analysis,
    analysisPreview,
    spanIdsMap,
  };
}

export async function generateOrGetTraceSummary(input: z.infer<typeof GenerateTraceSummaryRequestSchema>): Promise<z.infer<typeof TraceSummarySchema>> {

  const existingSummary = await getTraceSummary(input);
  if (existingSummary) {
    return existingSummary;
  }

  return await generateTraceSummary(input);

}
