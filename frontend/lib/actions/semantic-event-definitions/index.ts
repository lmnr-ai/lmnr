import { and, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { difference } from "lodash";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { cache, SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY } from "@/lib/cache.ts";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { semanticEventDefinitions, semanticEventTriggerSpans } from "@/lib/db/migrations/schema";

export type SemanticEventDefinitionRow = Omit<SemanticEventDefinition, "prompt" | "structuredOutput">;

export type SemanticEventDefinition = {
  id: string;
  name: string;
  createdAt: string;
  projectId: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  triggerSpans: string[];
};

export const GetSemanticEventDefinitionsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
});

export const GetSemanticEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const CreateSemanticEventDefinitionSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required").max(255, { error: "Name must be less than 255 characters" }),
  prompt: z.string(),
  structuredOutput: z.record(z.string(), z.unknown()),
  triggerSpans: z.array(z.string()).optional().default([]),
});

export const UpdateSemanticEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  prompt: z.string(),
  structuredOutput: z.record(z.string(), z.unknown()),
  triggerSpans: z.array(z.string()).optional().default([]),
});

export const DeleteSemanticEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const DeleteSemanticEventDefinitionsSchema = z.object({
  projectId: z.string(),
  ids: z.array(z.string()).min(1, "At least one event definition ID is required"),
});

export async function getSemanticEventDefinitions(input: z.infer<typeof GetSemanticEventDefinitionsSchema>) {
  const { projectId, pastHours, startDate, endDate, search, pageNumber, pageSize, filter } = input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(semanticEventDefinitions.projectId, projectId)];

  if (pastHours || (startDate && endDate)) {
    const timeRange = getTimeRange(pastHours, startDate, endDate);

    if ("start" in timeRange && timeRange.start) {
      whereConditions.push(gte(semanticEventDefinitions.createdAt, timeRange.start.toISOString()));
    }
    if ("end" in timeRange && timeRange.end) {
      whereConditions.push(lte(semanticEventDefinitions.createdAt, timeRange.end.toISOString()));
    }
    if ("pastHours" in timeRange && typeof timeRange.pastHours === "number") {
      const start = new Date(Date.now() - timeRange.pastHours * 60 * 60 * 1000);
      whereConditions.push(gte(semanticEventDefinitions.createdAt, start.toISOString()));
    }
  }

  if (search) {
    whereConditions.push(ilike(semanticEventDefinitions.name, `%${search}%`));
  }

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: semanticEventDefinitions.name },
    id: { type: "string", column: semanticEventDefinitions.id },
  } as const);

  whereConditions.push(...filterConditions);

  const results = await db
    .select({
      id: semanticEventDefinitions.id,
      createdAt: semanticEventDefinitions.createdAt,
      name: semanticEventDefinitions.name,
      projectId: semanticEventDefinitions.projectId,
    })
    .from(semanticEventDefinitions)
    .where(and(...whereConditions))
    .orderBy(desc(semanticEventDefinitions.createdAt))
    .limit(limit)
    .offset(offset);

  const triggerSpans = await db
    .select({
      eventDefinitionId: semanticEventTriggerSpans.eventDefinitionId,
      name: semanticEventTriggerSpans.spanName,
    })
    .from(semanticEventTriggerSpans)
    .where(
      and(
        eq(semanticEventTriggerSpans.projectId, projectId),
        inArray(
          semanticEventTriggerSpans.eventDefinitionId,
          results.map((r) => r.id)
        )
      )
    );

  const triggerSpansByEvent = triggerSpans.reduce(
    (acc, span) => ({
      ...acc,
      [span.eventDefinitionId]: [...(acc[span.eventDefinitionId] || []), span.name],
    }),
    {} as Record<string, string[]>
  );

  const items = results.map((eventDef) => ({
    ...eventDef,
    triggerSpans: triggerSpansByEvent[eventDef.id] || [],
  }));

  return {
    items,
  };
}

export async function getSemanticEventDefinition(input: z.infer<typeof GetSemanticEventDefinitionSchema>) {
  const { id, projectId } = GetSemanticEventDefinitionSchema.parse(input);

  const [result] = await db
    .select()
    .from(semanticEventDefinitions)
    .where(and(eq(semanticEventDefinitions.projectId, projectId), eq(semanticEventDefinitions.id, id)))
    .limit(1);

  if (!result) {
    return result;
  }

  const triggerSpans = await db
    .select({
      name: semanticEventTriggerSpans.spanName,
    })
    .from(semanticEventTriggerSpans)
    .where(
      and(
        eq(semanticEventTriggerSpans.projectId, projectId),
        eq(semanticEventTriggerSpans.eventDefinitionId, result.id)
      )
    );

  return {
    ...result,
    structuredOutput: result.structuredOutputSchema,
    triggerSpans: triggerSpans.map((s) => s.name),
  };
}

export async function createSemanticEventDefinition(input: z.infer<typeof CreateSemanticEventDefinitionSchema>) {
  const { projectId, name, prompt, structuredOutput, triggerSpans } = CreateSemanticEventDefinitionSchema.parse(input);

  const [result] = await db
    .insert(semanticEventDefinitions)
    .values({
      projectId,
      name,
      prompt,
      structuredOutputSchema: structuredOutput,
    })
    .returning();

  if (triggerSpans.length > 0) {
    await db.insert(semanticEventTriggerSpans).values(
      triggerSpans.map((spanName) => ({
        projectId,
        eventDefinitionId: result.id,
        spanName,
      }))
    );
    await cache.remove(`${SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);
  }

  return result;
}

export async function updateSemanticEventDefinition(input: z.infer<typeof UpdateSemanticEventDefinitionSchema>) {
  const { projectId, id, prompt, structuredOutput, triggerSpans } = UpdateSemanticEventDefinitionSchema.parse(input);

  const result = await db.transaction(async (tx) => {
    const [result] = await tx
      .update(semanticEventDefinitions)
      .set({ prompt, structuredOutputSchema: structuredOutput })
      .where(and(eq(semanticEventDefinitions.projectId, projectId), eq(semanticEventDefinitions.id, id)))
      .returning();

    if (!result) {
      return undefined;
    }

    await syncTriggerSpans(tx, projectId, result.id, triggerSpans);

    return result;
  });

  await cache.remove(`${SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);

  return result;
}

const syncTriggerSpans = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
  eventDefinitionId: string,
  targetSpans: string[]
) => {
  const currentSpans = await tx
    .select({ spanName: semanticEventTriggerSpans.spanName })
    .from(semanticEventTriggerSpans)
    .where(
      and(
        eq(semanticEventTriggerSpans.eventDefinitionId, eventDefinitionId),
        eq(semanticEventTriggerSpans.projectId, projectId)
      )
    );

  const currentSpanNames = currentSpans.map((s) => s.spanName);

  const toAdd = difference(targetSpans, currentSpanNames);
  const toRemove = difference(currentSpanNames, targetSpans);

  const deletions =
    toRemove.length > 0
      ? tx
        .delete(semanticEventTriggerSpans)
        .where(
          and(
            eq(semanticEventTriggerSpans.projectId, projectId),
            eq(semanticEventTriggerSpans.eventDefinitionId, eventDefinitionId),
            inArray(semanticEventTriggerSpans.spanName, toRemove)
          )
        )
      : Promise.resolve();

  const insertions =
    toAdd.length > 0
      ? tx
        .insert(semanticEventTriggerSpans)
        .values(toAdd.map((spanName) => ({ projectId, eventDefinitionId, spanName })))
      : Promise.resolve();

  await Promise.all([deletions, insertions]);
};

export async function deleteSemanticEventDefinition(input: z.infer<typeof DeleteSemanticEventDefinitionSchema>) {
  const { projectId, id } = DeleteSemanticEventDefinitionSchema.parse(input);

  const [result] = await db
    .delete(semanticEventDefinitions)
    .where(and(eq(semanticEventDefinitions.projectId, projectId), eq(semanticEventDefinitions.id, id)))
    .returning();

  await cache.remove(`${SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);

  return result;
}

export async function deleteSemanticEventDefinitions(input: z.infer<typeof DeleteSemanticEventDefinitionsSchema>) {
  const { projectId, ids } = DeleteSemanticEventDefinitionsSchema.parse(input);

  const events = await db
    .delete(semanticEventDefinitions)
    .where(and(eq(semanticEventDefinitions.projectId, projectId), inArray(semanticEventDefinitions.id, ids)))
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

  await cache.remove(`${SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);

  return { success: true };
}
