import { and, eq, inArray } from "drizzle-orm";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { evaluations, sharedEvals, sharedTraces } from "@/lib/db/migrations/schema";

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

  // Get all trace IDs for this evaluation from ClickHouse
  const result = await clickhouseClient.query({
    query: `SELECT DISTINCT trace_id FROM evaluation_datapoints WHERE evaluation_id = {evaluationId: UUID}`,
    query_params: { evaluationId },
  });

  const traceIds = ((await result.json()).data as { trace_id: string }[]).map((r) => r.trace_id);

  if (visibility === "public") {
    await db.transaction(async (tx) => {
      await tx.insert(sharedEvals).values({ id: evaluationId, projectId }).onConflictDoNothing();

      if (traceIds.length > 0) {
        await tx
          .insert(sharedTraces)
          .values(traceIds.map((id) => ({ id, projectId })))
          .onConflictDoNothing();
      }
    });
  } else {
    await db.transaction(async (tx) => {
      await tx.delete(sharedEvals).where(eq(sharedEvals.id, evaluationId));
      if (traceIds.length > 0) {
        await tx.delete(sharedTraces).where(inArray(sharedTraces.id, traceIds));
      }
    });
  }
}

export async function isEvaluationPublic(evaluationId: string): Promise<boolean> {
  const row = await db.query.sharedEvals.findFirst({
    where: eq(sharedEvals.id, evaluationId),
  });

  return !!row;
}
