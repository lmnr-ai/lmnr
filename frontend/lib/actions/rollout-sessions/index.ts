import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { rolloutPlaygrounds } from "@/lib/db/migrations/schema";

export type RolloutSession = {
  id: string;
  createdAt: string;
  projectId: string;
  traceId: string;
  pathToCount: Record<string, number>;
  cursorTimestamp: string;
};

const GetRolloutSessionSchema = z.object({
  traceId: z.string().optional(),
  projectId: z.string(),
  id: z.string(),
});

const CreateRolloutSessionSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  pathToCount: z.record(z.string(), z.number()).optional().default({}),
  cursorTimestamp: z.string(),
});

const UpdateRolloutSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  traceId: z.string(),
  cursorTimestamp: z.string(),
});

const GetRolloutSessionsSchema = z.object({
    projectId: z.string(),
});

export const getRolloutSessions = async (input: z.infer<typeof GetRolloutSessionsSchema>) => {
    const { projectId } = GetRolloutSessionsSchema.parse(input);

    const result = await db.select().from(rolloutPlaygrounds).where(eq(rolloutPlaygrounds.projectId, projectId));

    return result;
};

export async function getRolloutSession(input: z.infer<typeof GetRolloutSessionSchema>) {
  const { projectId, traceId, id } = GetRolloutSessionSchema.parse(input);

  const conditions = [eq(rolloutPlaygrounds.id, id), eq(rolloutPlaygrounds.projectId, projectId)];

  if (traceId) {
    conditions.push(eq(rolloutPlaygrounds.traceId, traceId));
  }

  const result = await db.query.rolloutPlaygrounds.findFirst({
    where: and(...conditions),
  });

  return result;
}

export async function createRolloutSession(input: z.infer<typeof CreateRolloutSessionSchema>) {
  const { projectId, traceId, pathToCount, cursorTimestamp } = CreateRolloutSessionSchema.parse(input);

  const [result] = await db
    .insert(rolloutPlaygrounds)
    .values({
      projectId,
      traceId,
      pathToCount,
      cursorTimestamp,
    })
    .returning();

  return result;
}

export async function updateRolloutSession(input: z.infer<typeof UpdateRolloutSessionSchema>) {
  const { id, projectId, traceId, cursorTimestamp } = UpdateRolloutSessionSchema.parse(input);

  const [result] = await db
    .update(rolloutPlaygrounds)
    .set({ traceId, cursorTimestamp })
    .where(and(eq(rolloutPlaygrounds.id, id), eq(rolloutPlaygrounds.projectId, projectId)))
    .returning();

  return result;
}
