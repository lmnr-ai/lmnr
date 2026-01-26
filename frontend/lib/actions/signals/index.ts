import { and, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { type Filter, FilterSchema, parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { cache, SIGNAL_TRIGGERS_CACHE_KEY } from "@/lib/cache.ts";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { signals, signalTriggers } from "@/lib/db/migrations/schema";

export type SignalRow = {
  id: string;
  name: string;
  createdAt: string;
  projectId: string;
  triggersCount: number;
};

export type Signal = {
  id: string;
  name: string;
  createdAt: string;
  projectId: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
};

export const GetSignalsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
});

export const GetSignalSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const TriggerSchema = z.object({
  id: z.string().optional(),
  filters: z.array(FilterSchema),
});

export const CreateSignalSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required").max(255, { error: "Name must be less than 255 characters" }),
  prompt: z.string(),
  structuredOutput: z.record(z.string(), z.unknown()),
  triggers: z.array(TriggerSchema).optional().default([]),
});

export const UpdateSignalSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  prompt: z.string(),
  structuredOutput: z.record(z.string(), z.unknown()),
  triggers: z.array(TriggerSchema).optional().default([]),
});

export const DeleteSignalSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const DeleteSignalsSchema = z.object({
  projectId: z.string(),
  ids: z.array(z.string()).min(1, "At least one signal ID is required"),
});

export async function getSignals(input: z.infer<typeof GetSignalsSchema>) {
  const { projectId, pastHours, startDate, endDate, search, pageNumber, pageSize, filter } = input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(signals.projectId, projectId)];

  if (pastHours || (startDate && endDate)) {
    const timeRange = getTimeRange(pastHours, startDate, endDate);

    if ("start" in timeRange && timeRange.start) {
      whereConditions.push(gte(signals.createdAt, timeRange.start.toISOString()));
    }
    if ("end" in timeRange && timeRange.end) {
      whereConditions.push(lte(signals.createdAt, timeRange.end.toISOString()));
    }
    if ("pastHours" in timeRange && typeof timeRange.pastHours === "number") {
      const start = new Date(Date.now() - timeRange.pastHours * 60 * 60 * 1000);
      whereConditions.push(gte(signals.createdAt, start.toISOString()));
    }
  }

  if (search) {
    whereConditions.push(ilike(signals.name, `%${search}%`));
  }

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: signals.name },
    id: { type: "string", column: signals.id },
  } as const);

  whereConditions.push(...filterConditions);

  const results = await db
    .select({
      id: signals.id,
      createdAt: signals.createdAt,
      name: signals.name,
      projectId: signals.projectId,
    })
    .from(signals)
    .where(and(...whereConditions))
    .orderBy(desc(signals.createdAt))
    .limit(limit)
    .offset(offset);

  // Get trigger counts per signal
  const triggerCounts = (await db
    .select({
      signalId: signalTriggers.signalId,
      count: sql`count(*)`.mapWith(Number),
    })
    .from(signalTriggers)
    .where(
      and(
        eq(signalTriggers.projectId, projectId),
        inArray(
          signalTriggers.signalId,
          results.map((r) => r.id)
        )
      )
    )
    .groupBy(signalTriggers.signalId)) as { signalId: string; count: number }[];

  const triggerCountBySignal = triggerCounts.reduce(
    (acc, row) => ({
      ...acc,
      [row.signalId]: row.count,
    }),
    {} as Record<string, number>
  );

  const items: SignalRow[] = results.map((signal) => ({
    ...signal,
    triggersCount: triggerCountBySignal[signal.id] || 0,
  }));

  return {
    items,
  };
}

export async function getSignal(input: z.infer<typeof GetSignalSchema>) {
  const { id, projectId } = GetSignalSchema.parse(input);

  const [result] = await db
    .select()
    .from(signals)
    .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
    .limit(1);

  if (!result) {
    return result;
  }

  const triggerRows = (await db
    .select({
      id: signalTriggers.id,
      value: signalTriggers.value,
      createdAt: signalTriggers.createdAt,
    })
    .from(signalTriggers)
    .where(and(eq(signalTriggers.projectId, projectId), eq(signalTriggers.signalId, result.id)))) as {
    id: string;
    value: Filter[];
    createdAt: string;
  }[];

  return {
    ...result,
    structuredOutput: result.structuredOutputSchema,
    triggers: triggerRows.map((row) => ({
      id: row.id,
      filters: row.value,
      createdAt: row.createdAt,
    })),
  };
}

export async function createSignal(input: z.infer<typeof CreateSignalSchema>) {
  const { projectId, name, prompt, structuredOutput, triggers } = CreateSignalSchema.parse(input);

  const [result] = await db
    .insert(signals)
    .values({
      projectId,
      name,
      prompt,
      structuredOutputSchema: structuredOutput,
    })
    .returning();

  if (triggers.length > 0) {
    await db.insert(signalTriggers).values(
      triggers.map((trigger) => ({
        projectId,
        signalId: result.id,
        value: trigger.filters,
      }))
    );

    await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);
  }

  return result;
}

export async function updateSignal(input: z.infer<typeof UpdateSignalSchema>) {
  const { projectId, id, prompt, structuredOutput, triggers } = UpdateSignalSchema.parse(input);

  const result = await db.transaction(async (tx) => {
    const [result] = await tx
      .update(signals)
      .set({ prompt, structuredOutputSchema: structuredOutput })
      .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
      .returning();

    if (!result) {
      return undefined;
    }

    // Delete existing triggers and insert new ones (overwrite approach)
    await tx
      .delete(signalTriggers)
      .where(and(eq(signalTriggers.projectId, projectId), eq(signalTriggers.signalId, result.id)));

    if (triggers.length > 0) {
      await tx.insert(signalTriggers).values(
        triggers.map((trigger) => ({
          projectId,
          signalId: result.id,
          value: trigger.filters,
        }))
      );
    }

    return result;
  });

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return result;
}

export async function deleteSignal(input: z.infer<typeof DeleteSignalSchema>) {
  const { projectId, id } = DeleteSignalSchema.parse(input);

  const [result] = await db
    .delete(signals)
    .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
    .returning();

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return result;
}

export async function deleteSignals(input: z.infer<typeof DeleteSignalsSchema>) {
  const { projectId, ids } = DeleteSignalsSchema.parse(input);

  const events = await db
    .delete(signals)
    .where(and(eq(signals.projectId, projectId), inArray(signals.id, ids)))
    .returning();

  if (events.length > 0) {
    try {
      await clickhouseClient.command({
        query: `
          DELETE FROM events
          WHERE project_id = {projectId: UUID}
            AND name IN ({eventNames: Array(String)})
            AND source = 'SEMANTIC'
        `,
        query_params: {
          projectId,
          eventNames: events.map((e) => e.name),
        },
      });
    } catch (error) {
      console.error("Failed to delete events from ClickHouse:", error);
    }
  }

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return { success: true };
}

export { executeSignal } from "./execute";
