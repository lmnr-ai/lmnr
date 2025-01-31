import { count, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getSpansCountInProject } from "@/lib/clickhouse/spans";
import { db } from "@/lib/db/drizzle";
import { datasets, evaluations } from "@/lib/db/migrations/schema";

export async function GET(_req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const spansResult = await getSpansCountInProject(projectId);

  const [datasetResult = { count: 0 }] = await db
    .select({ count: count(datasets.id) })
    .from(datasets)
    .where(eq(datasets.projectId, projectId));

  const [evalResults = { count: 0 }] = await db
    .select({
      count: count(evaluations.id),
    })
    .from(evaluations)
    .where(eq(evaluations.projectId, projectId));

  return new Response(
    JSON.stringify({
      datasetsCount: datasetResult.count,
      evaluationsCount: evalResults.count,
      spansCount: spansResult?.[0]?.count,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
