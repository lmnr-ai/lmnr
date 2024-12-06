import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { datasetDatapoints, datasets } from '@/lib/db/migrations/schema';
import { DownloadFormat } from '@/lib/types';
import { json2csv } from 'json-2-csv';

export async function GET(
  req: Request,
  {
    params
  }: {
    params: { projectId: string; datasetId: string; format: DownloadFormat };
  }
): Promise<Response> {


  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const format = params.format;

  if (!Object.values(DownloadFormat).includes(format)) {
    return Response.json(
      { error: 'Invalid format. Supported formats are: csv, json' },
      { status: 400 }
    );
  }

  const dataset = await db.query.datasets.findFirst({
    where: and(
      eq(datasets.id, datasetId),
      eq(datasets.projectId, projectId)
    )
  });

  if (!dataset) {
    return Response.json({ error: 'Dataset not found' }, { status: 404 });
  }

  const datapoints = await db.query.datasetDatapoints.findMany({
    where: eq(datasetDatapoints.datasetId, datasetId),
    orderBy: [asc(datasetDatapoints.indexInBatch)],
    columns: {
      data: true,
      target: true,
      metadata: true
    }
  });

  // if the format is csv, convert the datapoints to csv
  if (format === 'csv') {
    const csv = await json2csv(datapoints, {
      emptyFieldValue: '',
      expandNestedObjects: false
    });
    const contentType = 'text/csv';
    const filename = `${dataset.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${datasetId}.csv`;
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);

    return new Response(csv, {
      headers
    });
  }
  // else the format is json, return the datapoints as json
  const contentType = 'application/json';
  const filename = `${dataset.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${datasetId}.json`;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  return new Response(JSON.stringify(datapoints, null, 2), {
    headers
  });
}
