import { count, eq, or } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { clickhouseClient } from '@/lib/clickhouse/client';
import { getSpansCountInProject } from '@/lib/clickhouse/spans';
import { db } from '@/lib/db/drizzle';
import { datasets, evaluations } from '@/lib/db/migrations/schema';

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const spansResult = await getSpansCountInProject(clickhouseClient, projectId);

  const [result = { datasetsCount: 0, evaluationsCount: 0 }] = await db
    .select({
      datasetsCount: count(datasets.id),
      evaluationsCount: count(evaluations.id)
    })
    .from(datasets)
    .fullJoin(evaluations, eq(evaluations.projectId, datasets.projectId))
    .where(
      or(
        eq(datasets.projectId, projectId),
        eq(evaluations.projectId, projectId)
      )
    );

  return new Response(
    JSON.stringify({
      datasetsCount: result.datasetsCount,
      evaluationsCount: result.evaluationsCount,
      spansCount: spansResult?.[0]?.count
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
