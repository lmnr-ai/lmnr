import { db } from '@/lib/db/drizzle';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';
import { asc, and, eq } from 'drizzle-orm';
import { datasetDatapoints, datasets, evaluationResults, evaluations } from '@/lib/db/migrations/schema';
import { evaluationScores } from '@/lib/db/migrations/schema';
import { sql } from 'drizzle-orm';

export async function GET(
  req: Request,
  {
    params
  }: {
    params: { projectId: string; datasetId: string; };
  }
): Promise<Response> {
  if (!(await isCurrentUserMemberOfProject(params.projectId))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.projectId;
  const datasetId = params.datasetId;

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

  const contentType = 'application/json';
  const filename = `${dataset.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${datasetId}.json`;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(JSON.stringify(datapoints, null, 2), {
    headers
  });
}
