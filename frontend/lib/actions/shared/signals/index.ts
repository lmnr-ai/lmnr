import "server-only";
import { eq } from "drizzle-orm";
import type z from "zod/v4";

import { GetSharedTraceSchema } from "@/lib/actions/shared/trace";
import { getTraceSignals, type TraceSignal } from "@/lib/actions/signals/trace";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

/** The signal's own instructions are internal, and nothing in the panel renders
 *  them — so the public route never carries them off the server. */
export type SharedTraceSignal = Omit<TraceSignal, "prompt">;

/**
 * A shared trace's signal events and their leaf clusters. The `sharedTraces` row
 * IS the authorization (same as `getSharedSpans`) — it also supplies the project
 * id, which the caller never sees and must not have to guess.
 */
export const getSharedTraceSignals = async (
  input: z.infer<typeof GetSharedTraceSchema>
): Promise<SharedTraceSignal[]> => {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  const signals = await getTraceSignals({
    projectId: sharedTrace.projectId,
    traceId,
  });

  return signals.map(({ prompt: _prompt, ...signal }) => signal);
};
