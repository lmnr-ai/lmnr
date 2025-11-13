import { and, eq } from 'drizzle-orm';
import { json2csv } from 'json-2-csv';

import { getAllDatapointsForDataset } from '@/lib/actions/datapoints';
import { db } from '@/lib/db/drizzle';
import { datasets } from '@/lib/db/migrations/schema';
import { DownloadFormat } from '@/lib/types';

export async function GET(
  req: Request,
  props: {
    params: Promise<{ projectId: string; datasetId: string; format: string }>;
  }
): Promise<Response> {
  const params = await props.params;


  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const format = params.format;

  if (!Object.values(DownloadFormat).includes(format as DownloadFormat)) {
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

  // Get datapoints from ClickHouse
  const chDatapoints = await getAllDatapointsForDataset(projectId, datasetId);

  // Transform ClickHouse data to match expected format
  const datapoints = chDatapoints.map(dp => ({
    data: JSON.parse(dp.data),
    target: dp.target ? JSON.parse(dp.target) : null,
    metadata: JSON.parse(dp.metadata),
  }));

  // if the format is csv, convert the datapoints to csv
  if (format === 'csv') {
    const csv = json2csv(datapoints, {
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
  // if the format is json, return the datapoints as json
  const contentType = 'application/json';
  const filename = `${dataset.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${datasetId}.json`;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  return new Response(JSON.stringify(datapoints, null, 2), {
    headers
  });
}
