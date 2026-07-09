import { desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
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
  return NextResponse.json(groups);
}
