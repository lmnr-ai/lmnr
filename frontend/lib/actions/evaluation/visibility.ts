import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { evaluations, sharedEvals } from "@/lib/db/migrations/schema";

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

  if (visibility === "public") {
    await db
      .insert(sharedEvals)
      .values({ id: evaluationId, projectId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(sharedEvals)
      .where(eq(sharedEvals.id, evaluationId));
  }

  // TODO: make all evaluation traces public/private
}

export async function isEvaluationPublic(evaluationId: string): Promise<boolean> {
  const row = await db.query.sharedEvals.findFirst({
    where: eq(sharedEvals.id, evaluationId),
  });

  return !!row;
}
