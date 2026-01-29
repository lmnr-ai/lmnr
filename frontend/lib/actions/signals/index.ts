import { and, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { z } from "zod/v4";

import { type Filter, parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
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
  eventsCount: number;
  lastEventAt: string | null;
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

const GetSignalSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

const CreateSignalSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required").max(255, { error: "Name must be less than 255 characters" }),
  prompt: z.string(),
  structuredOutput: z.record(z.string(), z.unknown()),
});

const UpdateSignalSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  prompt: z.string(),
  structuredOutput: z.record(z.string(), z.unknown()),
});

export const DeleteSignalSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

const DeleteSignalsSchema = z.object({
  projectId: z.string(),
  ids: z.array(z.string()).min(1, "At least one signal ID is required"),
});

const GetLastEventSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  signalId: z.string(),
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

  const signalIds = results.map((r) => r.id);
  let triggerCountBySignal: Record<string, number> = {};
  let eventCountBySignal: Record<string, number> = {};
  let lastEventBySignal: Record<string, string> = {};

  if (signalIds.length > 0) {
    const triggerCountsResult = await db
      .select({
        signalId: signalTriggers.signalId,
      })
      .from(signalTriggers)
      .where(and(eq(signalTriggers.projectId, projectId), inArray(signalTriggers.signalId, signalIds)));

    triggerCountBySignal = triggerCountsResult.reduce(
      (acc, row) => ({
        ...acc,
        [row.signalId]: (acc[row.signalId] || 0) + 1,
      }),
      {} as Record<string, number>
    );

    const eventCountsResult = await clickhouseClient.query({
      query: `
        SELECT
          signal_id,
          count(*) as count
        FROM signal_events
        WHERE project_id = {projectId: UUID}
          AND signal_id IN ({signalIds: Array(UUID)})
        GROUP BY signal_id
      `,
      query_params: {
        projectId,
        signalIds,
      },
      format: "JSONEachRow",
    });

    const eventCounts = (await eventCountsResult.json()) as { signal_id: string; count: string }[];

    eventCountBySignal = eventCounts.reduce(
      (acc, row) => ({
        ...acc,
        [row.signal_id]: parseInt(row.count, 10),
      }),
      {} as Record<string, number>
    );

    const lastEventResult = await clickhouseClient.query({
      query: `
        SELECT
          signal_id,
          formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.%fZ') as last_event_at
        FROM signal_events
        WHERE project_id = {projectId: UUID}
          AND signal_id IN ({signalIds: Array(UUID)})
        GROUP BY signal_id
      `,
      query_params: {
        projectId,
        signalIds,
      },
      format: "JSONEachRow",
    });

    const lastEvents = (await lastEventResult.json()) as { signal_id: string; last_event_at: string }[];

    lastEventBySignal = lastEvents.reduce(
      (acc, row) => ({
        ...acc,
        [row.signal_id]: row.last_event_at,
      }),
      {} as Record<string, string>
    );
  }

  const items: SignalRow[] = results.map((signal) => ({
    ...signal,
    triggersCount: triggerCountBySignal[signal.id] || 0,
    eventsCount: eventCountBySignal[signal.id] || 0,
    lastEventAt: lastEventBySignal[signal.id] || null,
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
  const { projectId, name, prompt, structuredOutput } = CreateSignalSchema.parse(input);

  const [result] = await db
    .insert(signals)
    .values({
      projectId,
      name,
      prompt,
      structuredOutputSchema: structuredOutput,
    })
    .returning();

  return result;
}

export async function updateSignal(input: z.infer<typeof UpdateSignalSchema>) {
  const { projectId, id, prompt, structuredOutput } = UpdateSignalSchema.parse(input);

  const result = await db
    .update(signals)
    .set({ prompt, structuredOutputSchema: structuredOutput })
    .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
    .returning();

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

export const getLastEvent = async (input: z.infer<typeof GetLastEventSchema>) => {
  const { projectId, name, signalId } = GetLastEventSchema.parse(input);

  const query = `
      SELECT
          id,
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp, 
      name
      FROM signal_events
      WHERE signal_id = {signalId: UUID} AND name = {name: String}
      ORDER BY timestamp DESC
      LIMIT 1
  `;

  const [result] = await executeQuery<{ name: string; id: string; timestamp: string }>({
    projectId,
    query,
    parameters: {
      name,
      projectId,
      signalId,
    },
  });

  return result;
};
