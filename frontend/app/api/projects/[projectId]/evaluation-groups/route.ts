import { desc, eq, sql } from "drizzle-orm";

import { handleRoute } from "@/lib/api/route-handler";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";

export const GET = handleRoute<{ projectId: string }, unknown>(async (_req, params) => {
  const { projectId } = params;

  const groupedEvaluations = db.$with("grouped_evaluations").as(
    db
      .select({
        groupId: evaluations.groupId,
        lastEvaluationCreatedAt: sql<Date>`MAX(${evaluations.createdAt})`.as("lastEvaluationCreatedAt"),
      })
      .from(evaluations)
      .where(eq(evaluations.projectId, projectId))
      .groupBy(evaluations.groupId)
  );

  const groups = await db
    .with(groupedEvaluations)
    .select({
      groupId: groupedEvaluations.groupId,
      lastEvaluationCreatedAt: groupedEvaluations.lastEvaluationCreatedAt,
    })
    .from(groupedEvaluations)
    .orderBy(desc(groupedEvaluations.lastEvaluationCreatedAt));

  return groups;
});
