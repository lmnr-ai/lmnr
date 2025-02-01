import { count, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getSpansCountInProject } from "@/lib/clickhouse/spans";
import { db } from "@/lib/db/drizzle";
import { datasets, evaluations } from "@/lib/db/migrations/schema";

export async function GET(_req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const spansQuery = getSpansCountInProject(projectId);

  const datasetsQuery = db
    .select({ count: count(datasets.id) })
    .from(datasets)
    .where(eq(datasets.projectId, projectId));

  const evalsQuery = db
    .select({
      count: count(evaluations.id),
    })
    .from(evaluations)
    .where(eq(evaluations.projectId, projectId));

  const [[spansResult = { count: 0 }], [datasetsResult = { count: 0 }], [evalsResult = { count: 0 }]] =
    await Promise.all([spansQuery, datasetsQuery, evalsQuery]);

  return new Response(
    JSON.stringify({
      datasetsCount: datasetsResult.count,
      evaluationsCount: evalsResult.count,
      spansCount: spansResult.count,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
