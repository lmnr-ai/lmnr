import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations, sharedEvals, sharedTraces } from "@/lib/db/migrations/schema";

export async function updateEvaluationVisibility({
  evaluationId,
  projectId,
  visibility,
}: {
  evaluationId: string;
  projectId: string;
  visibility: "public" | "private";
}) {
  // Verify evaluation exists and belongs to this project
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  // Get all trace IDs for this evaluation
  const evalResults = await db
    .select({ traceId: evaluationResults.traceId })
    .from(evaluationResults)
    .where(eq(evaluationResults.evaluationId, evaluationId));

  const traceIds = [...new Set(evalResults.map((r) => r.traceId))];

  if (visibility === "public") {
    await db
      .insert(sharedEvals)
      .values({ id: evaluationId, projectId })
      .onConflictDoNothing();

    if (traceIds.length > 0) {
      await db
        .insert(sharedTraces)
        .values(traceIds.map((id) => ({ id, projectId })))
        .onConflictDoNothing();
    }
  } else {
    await db
      .delete(sharedEvals)
      .where(eq(sharedEvals.id, evaluationId));

    if (traceIds.length > 0) {
      await db
        .delete(sharedTraces)
        .where(inArray(sharedTraces.id, traceIds));
    }
  }
}

export async function isEvaluationPublic(evaluationId: string): Promise<boolean> {
  const row = await db.query.sharedEvals.findFirst({
    where: eq(sharedEvals.id, evaluationId),
  });

  return !!row;
}
