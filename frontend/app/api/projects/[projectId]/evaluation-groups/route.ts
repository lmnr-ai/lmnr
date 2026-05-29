import { desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const groupedEvaluations = db.$with("grouped_evaluations").as(
    db
      .select({
        groupId: evaluations.groupId,
        lastEvaluationCreatedAt: sql<Date>`MAX(${evaluations.createdAt})`.as("lastEvaluationCreatedAt"),
        firstEvaluationCreatedAt: sql<Date>`MIN(${evaluations.createdAt})`.as("firstEvaluationCreatedAt"),
        runCount: sql<number>`COUNT(*)::int`.as("runCount"),
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
      firstEvaluationCreatedAt: groupedEvaluations.firstEvaluationCreatedAt,
      runCount: groupedEvaluations.runCount,
    })
    .from(groupedEvaluations)
    .orderBy(desc(groupedEvaluations.lastEvaluationCreatedAt));
  return NextResponse.json(groups);
}
