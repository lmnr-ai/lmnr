import { desc, eq, sql } from "drizzle-orm";

import { apiHandler } from "@/lib/api/api-handler";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  const lastEvaluationCreatedAt = sql<Date>`MAX(${evaluations.createdAt})`.as("lastEvaluationCreatedAt");
  const groups = await db
    .select({
      groupId: evaluations.groupId,
      lastEvaluationCreatedAt,
      firstEvaluationCreatedAt: sql<Date>`MIN(${evaluations.createdAt})`.as("firstEvaluationCreatedAt"),
      runCount: sql<number>`COUNT(*)::int`.as("runCount"),
    })
    .from(evaluations)
    .where(eq(evaluations.projectId, projectId))
    .groupBy(evaluations.groupId)
    .orderBy(desc(lastEvaluationCreatedAt));
  return Response.json(groups);
});
