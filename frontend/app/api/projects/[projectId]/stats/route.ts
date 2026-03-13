import { count, eq } from "drizzle-orm";

import { handleRoute } from "@/lib/api/route-handler";
import { getSpansCountInProject } from "@/lib/clickhouse/spans";
import { db } from "@/lib/db/drizzle";
import { datasets, evaluations } from "@/lib/db/migrations/schema";

export const GET = handleRoute<{ projectId: string }, unknown>(async (_req, params) => {
  const { projectId } = params;

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

  return {
    datasetsCount: datasetsResult.count,
    evaluationsCount: evalsResult.count,
    spansCount: spansResult.count,
  };
});
