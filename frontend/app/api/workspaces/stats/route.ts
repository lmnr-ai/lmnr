import { count, eq, inArray, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { clickhouseClient } from '@/lib/clickhouse/client';
import { getSpansCountInProjects } from '@/lib/clickhouse/spans';
import { db } from '@/lib/db/drizzle';
import { datasets, evaluations } from '@/lib/db/migrations/schema';

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const projectIds = req.nextUrl.searchParams.getAll('projectId');

  const spansCount = await getSpansCountInProjects(
    clickhouseClient,
    projectIds
  );

  const datasetsEvalsCount = await db
    .select({
      id: sql<string>`COALESCE(${datasets.projectId}, ${evaluations.projectId})`,
      datasetsCount: count(datasets.id),
      evaluationsCount: count(evaluations.id)
    })
    .from(datasets)
    .fullJoin(evaluations, eq(evaluations.projectId, datasets.projectId))
    .where(
      inArray(
        sql`COALESCE(${datasets.projectId}, ${evaluations.projectId})`,
        projectIds
      )
    )
    .groupBy(sql`COALESCE(${datasets.projectId}, ${evaluations.projectId})`);

  const result: Record<
    string,
    { datasetsCount: number; evaluationsCount: number; spansCount: number }
  > = Object.fromEntries(
    projectIds.map((projectId) => [
      projectId,
      {
        datasetsCount:
          datasetsEvalsCount.find((d) => d.id === projectId)?.datasetsCount ??
          0,
        evaluationsCount:
          datasetsEvalsCount.find((d) => d.id === projectId)
            ?.evaluationsCount ?? 0,
        spansCount: spansCount.find((s) => s.id === projectId)?.count ?? 0
      }
    ])
  );

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
}
