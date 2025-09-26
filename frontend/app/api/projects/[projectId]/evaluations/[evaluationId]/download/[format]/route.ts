import { and, eq } from 'drizzle-orm';
import { json2csv } from 'json-2-csv';

import { executeQuery } from '@/lib/actions/sql';
import { db } from '@/lib/db/drizzle';
import { evaluations } from '@/lib/db/migrations/schema';
import { DownloadFormat } from '@/lib/types';
import { tryParseJson } from '@/lib/utils';

export async function GET(
  req: Request,
  props: {
    params: Promise<{ projectId: string; evaluationId: string; format: string }>;
  }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;
  const format = params.format as DownloadFormat;

  if (!Object.values(DownloadFormat).includes(format)) {
    return Response.json(
      { error: 'Invalid format. Supported formats are: csv, json' },
      { status: 400 }
    );
  }

  const evaluation = await db.query.evaluations.findFirst({
    where: and(
      eq(evaluations.id, evaluationId),
      eq(evaluations.projectId, projectId)
    )
  });

  if (!evaluation) {
    return Response.json({ error: 'Evaluation not found' }, { status: 404 });
  }

  const chDatapoints = await executeQuery(
    {
      projectId,
      query: `
        SELECT id, index, executor_output executorOutput, data, target, metadata, scores, created_at createdAt
        FROM evaluation_datapoints
        WHERE evaluation_id = {evaluationId: UUID}
        ORDER BY index ASC, created_at ASC
      `,
      parameters: {
        projectId,
        evaluationId,
      },
    }
  ) as {
    id: string;
    index: number;
    executorOutput: string;
    data: string;
    target: string;
    metadata: string;
    scores: string;
  }[];

  const datapoints = chDatapoints.map(datapoint => ({
    ...datapoint,
    scores: tryParseJson(datapoint.scores) as Record<string, number | null> ?? datapoint.scores,
    data: tryParseJson(datapoint.data) ?? datapoint.data,
    target: tryParseJson(datapoint.target) ?? datapoint.target,
    executorOutput: tryParseJson(datapoint.executorOutput) ?? datapoint.executorOutput,
  }));

  const flattenedResults = datapoints.map(result => {
    const { scores, ...rest } = result;
    return {
      ...rest,
      ...scores
    };
  });

  // else the format is json, return the results as json
  if (format === DownloadFormat.JSON) {
    const json = JSON.stringify(flattenedResults);
    const contentType = 'application/json';
    const filename = `${evaluation.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${evaluationId}.json`;
    return new Response(json, {
      headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` }
    });
  }

  // if the format is csv, convert the results to csv
  const csv = json2csv(flattenedResults, {
    emptyFieldValue: '',
    expandNestedObjects: false
  });
  const contentType = 'text/csv';
  const filename = `${evaluation.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${evaluationId}.csv`;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(csv, {
    headers
  });
}
