import { and, desc, eq, ne } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter, FilterSchema } from "@/lib/actions/common/filter-schemas";
import { Operator } from "@/lib/actions/common/operators";
import { FiltersSchema } from "@/lib/actions/common/types";
import { cache, SIGNAL_TRIGGERS_CACHE_KEY } from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle";
import { signalTriggers } from "@/lib/db/migrations/schema";

export type Trigger = {
  id: string;
  /**
   * When the signal is evaluated. Decidable from a single span batch, so the
   * backend can fire it without reading cumulative trace state.
   */
  conditions: Filter[];
  /** Whether a fired trigger actually runs. Needs the trace's cumulative state. */
  filters: Filter[];
  createdAt?: string;
  /** 0 = batch, 1 = realtime */
  mode: number;
};

export const GetSignalTriggersSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  ...FiltersSchema.shape,
});

/**
 * A trigger with no conditions never fires (`trigger_fires` in the backend's
 * `evaluate.rs` returns false for an empty list), so persisting one produces a
 * signal that looks configured but is silently inert. Rejected here rather than
 * defended against at each read site — `filters` may legitimately be empty
 * (no filters = run on every triggered trace).
 */
const TriggerConditionsSchema = z.array(FilterSchema).min(1, "A trigger must have at least one condition");

export const CreateSignalTriggerSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  conditions: TriggerConditionsSchema,
  filters: z.array(FilterSchema).default([]),
  mode: z.number().int().min(0).max(1).default(0),
});

export const UpdateSignalTriggerSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  triggerId: z.guid(),
  conditions: TriggerConditionsSchema,
  filters: z.array(FilterSchema).default([]),
  mode: z.number().int().min(0).max(1).optional(),
});

export const DeleteSignalTriggersSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
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
      filters: signalTriggers.filters,
      createdAt: signalTriggers.createdAt,
      mode: signalTriggers.mode,
    })
    .from(signalTriggers)
    .where(and(...whereConditions))
    .orderBy(desc(signalTriggers.createdAt))) as {
    id: string;
    value: Filter[];
    filters: Filter[];
    createdAt: string;
    mode: number;
  }[];

  return {
    items: rows.map((row) => ({
      id: row.id,
      conditions: row.value,
      filters: row.filters ?? [],
      createdAt: row.createdAt,
      mode: row.mode,
    })),
  };
}

export async function createSignalTrigger(input: z.infer<typeof CreateSignalTriggerSchema>) {
  const { projectId, signalId, conditions, filters, mode } = CreateSignalTriggerSchema.parse(input);

  const [result] = await db
    .insert(signalTriggers)
    .values({
      projectId,
      signalId,
      value: conditions,
      filters,
      mode,
    })
    .returning();

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return {
    id: result.id,
    conditions: result.value as Filter[],
    filters: (result.filters ?? []) as Filter[],
    createdAt: result.createdAt,
    mode: result.mode,
  };
}

export async function updateSignalTrigger(input: z.infer<typeof UpdateSignalTriggerSchema>) {
  const { projectId, signalId, triggerId, conditions, filters, mode } = UpdateSignalTriggerSchema.parse(input);

  const setValues: Record<string, unknown> = { value: conditions, filters };
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
    conditions: result.value as Filter[],
    filters: (result.filters ?? []) as Filter[],
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
