import { and, desc, eq, ne } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter, FilterSchema } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { FiltersSchema } from "@/lib/actions/common/types";
import { cache, SIGNAL_TRIGGERS_CACHE_KEY } from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle";
import { signalTriggers } from "@/lib/db/migrations/schema";

export type Trigger = {
  id: string;
  filters: Filter[];
  createdAt?: string;
  /** 0 = batch, 1 = realtime */
  mode: number;
};

export const GetSignalTriggersSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  ...FiltersSchema.shape,
});

export const CreateSignalTriggerSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  filters: z.array(FilterSchema),
  mode: z.number().int().min(0).max(1).default(0),
});

export const UpdateSignalTriggerSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  triggerId: z.string(),
  filters: z.array(FilterSchema),
  mode: z.number().int().min(0).max(1).optional(),
});

export const DeleteSignalTriggersSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  triggerIds: z.array(z.string()).min(1, "At least one trigger ID is required"),
});

export async function getSignalTriggers(input: z.infer<typeof GetSignalTriggersSchema>) {
  const { projectId, signalId, filter } = input;

  const filters = compact(filter);

  const whereConditions = [eq(signalTriggers.projectId, projectId), eq(signalTriggers.signalId, signalId)];

  for (const f of filters) {
    if (f.column === "trigger_id") {
      if (f.operator === Operator.Eq) {
        whereConditions.push(eq(signalTriggers.id, String(f.value)));
      } else if (f.operator === Operator.Ne) {
        whereConditions.push(ne(signalTriggers.id, String(f.value)));
      }
    }
  }

  const rows = (await db
    .select({
      id: signalTriggers.id,
      value: signalTriggers.value,
      createdAt: signalTriggers.createdAt,
      mode: signalTriggers.mode,
    })
    .from(signalTriggers)
    .where(and(...whereConditions))
    .orderBy(desc(signalTriggers.createdAt))) as {
    id: string;
    value: Filter[];
    createdAt: string;
    mode: number;
  }[];

  return {
    items: rows.map((row) => ({
      id: row.id,
      filters: row.value,
      createdAt: row.createdAt,
      mode: row.mode,
    })),
  };
}

export async function createSignalTrigger(input: z.infer<typeof CreateSignalTriggerSchema>) {
  const { projectId, signalId, filters, mode } = CreateSignalTriggerSchema.parse(input);

  const [result] = await db
    .insert(signalTriggers)
    .values({
      projectId,
      signalId,
      value: filters,
      mode,
    })
    .returning();

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return {
    id: result.id,
    filters: result.value as Filter[],
    createdAt: result.createdAt,
    mode: result.mode,
  };
}

export async function updateSignalTrigger(input: z.infer<typeof UpdateSignalTriggerSchema>) {
  const { projectId, signalId, triggerId, filters, mode } = UpdateSignalTriggerSchema.parse(input);

  const setValues: Record<string, unknown> = { value: filters };
  if (mode !== undefined) {
    setValues.mode = mode;
  }

  const [result] = await db
    .update(signalTriggers)
    .set(setValues)
    .where(
      and(
        eq(signalTriggers.projectId, projectId),
        eq(signalTriggers.signalId, signalId),
        eq(signalTriggers.id, triggerId)
      )
    )
    .returning();

  if (!result) {
    return undefined;
  }

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return {
    id: result.id,
    filters: result.value as Filter[],
    createdAt: result.createdAt,
    mode: result.mode,
  };
}

export async function deleteSignalTriggers(input: z.infer<typeof DeleteSignalTriggersSchema>) {
  const { projectId, signalId, triggerIds } = DeleteSignalTriggersSchema.parse(input);

  const results = await Promise.all(
    triggerIds.map((triggerId) =>
      db
        .delete(signalTriggers)
        .where(
          and(
            eq(signalTriggers.projectId, projectId),
            eq(signalTriggers.signalId, signalId),
            eq(signalTriggers.id, triggerId)
          )
        )
        .returning()
    )
  );

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return { deletedCount: results.flat().length };
}
