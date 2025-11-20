import { and, desc, eq, gte, ilike, inArray, isNotNull, lte } from "drizzle-orm";
import { difference } from "lodash";
import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types";
import { cache, SUMMARY_TRIGGER_SPANS_CACHE_KEY } from "@/lib/cache.ts";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { eventDefinitions, summaryTriggerSpans } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";

export type EventDefinitionRow = Omit<EventDefinition, "prompt" | "structuredOutput">;

export type EventDefinition = {
  id: string;
  name: string;
  createdAt: string;
  projectId: string;
  prompt: string | null;
  structuredOutput: Record<string, unknown> | null;
  isSemantic: boolean;
  triggerSpans: string[];
};

export const GetEventDefinitionsSchema = z.object({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
  pageNumber: z.coerce.number().default(0),
  pageSize: z.coerce.number().default(50),
  filter: z.array(z.any()).optional().default([]),
});

export const GetEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const CreateEventDefinitionSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required").max(255, { error: "Name must be less than 255 characters" }),
  prompt: z.string().nullable(),
  structuredOutput: z.record(z.string(), z.unknown()).nullable(),
  triggerSpans: z.array(z.string()).optional().default([]),
});

export const UpdateEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  prompt: z.string().nullable(),
  structuredOutput: z.record(z.string(), z.unknown()).nullable(),
  triggerSpans: z.array(z.string()).optional().default([]),
});

export const DeleteEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const DeleteEventDefinitionsSchema = z.object({
  projectId: z.string(),
  ids: z.array(z.string()).min(1, "At least one event definition ID is required"),
});

export async function getEventDefinitions(input: z.infer<typeof GetEventDefinitionsSchema>) {
  const { projectId, pastHours, startDate, endDate, search, pageNumber, pageSize, filter } =
    GetEventDefinitionsSchema.parse(input);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(eventDefinitions.projectId, projectId)];

  // Time range is optional for event definitions
  if (pastHours || (startDate && endDate)) {
    const timeRange = getTimeRange(pastHours, startDate, endDate);

    if ("start" in timeRange && timeRange.start) {
      whereConditions.push(gte(eventDefinitions.createdAt, timeRange.start.toISOString()));
    }
    if ("end" in timeRange && timeRange.end) {
      whereConditions.push(lte(eventDefinitions.createdAt, timeRange.end.toISOString()));
    }
    if ("pastHours" in timeRange && typeof timeRange.pastHours === "number") {
      const start = new Date(Date.now() - timeRange.pastHours * 60 * 60 * 1000);
      whereConditions.push(gte(eventDefinitions.createdAt, start.toISOString()));
    }
  }

  if (search) {
    whereConditions.push(ilike(eventDefinitions.name, `%${search}%`));
  }

  // Add filter conditions
  if (filter && Array.isArray(filter)) {
    filter.forEach((filterItem) => {
      try {
        const f: FilterDef = typeof filterItem === "string" ? JSON.parse(filterItem) : filterItem;
        const { column, operator, value } = f;
        const operatorStr = operator as string;

        if (column === "name") {
          if (operator === "eq") whereConditions.push(eq(eventDefinitions.name, value));
          else if (operatorStr === "contains") whereConditions.push(ilike(eventDefinitions.name, `%${value}%`));
        } else if (column === "id") {
          if (operator === "eq") whereConditions.push(eq(eventDefinitions.id, value));
          else if (operatorStr === "contains") whereConditions.push(ilike(eventDefinitions.id, `%${value}%`));
        }
      } catch (error) {
        // Skip invalid filter
      }
    });
  }

  const results = await db
    .select({
      id: eventDefinitions.id,
      createdAt: eventDefinitions.createdAt,
      name: eventDefinitions.name,
      projectId: eventDefinitions.projectId,
      isSemantic: eventDefinitions.isSemantic,
    })
    .from(eventDefinitions)
    .where(and(...whereConditions))
    .orderBy(desc(eventDefinitions.createdAt))
    .limit(limit)
    .offset(offset);

  const triggerSpans = await db
    .select({
      eventName: summaryTriggerSpans.eventName,
      name: summaryTriggerSpans.spanName,
    })
    .from(summaryTriggerSpans)
    .where(
      and(
        eq(summaryTriggerSpans.projectId, projectId),
        inArray(
          summaryTriggerSpans.eventName,
          results.map((r) => r.name)
        ),
        isNotNull(summaryTriggerSpans.eventName)
      )
    );

  const triggerSpansByEvent = triggerSpans.reduce(
    (acc, span) => {
      if (!span.eventName) return acc;
      return {
        ...acc,
        [span.eventName]: [...(acc[span.eventName] || []), span.name],
      };
    },
    {} as Record<string, string[]>
  );

  return results.map((eventDef) => ({
    ...eventDef,
    triggerSpans: triggerSpansByEvent[eventDef.name] || [],
  }));
}

export async function getEventDefinition(input: z.infer<typeof GetEventDefinitionSchema>) {
  const { id, projectId } = GetEventDefinitionSchema.parse(input);

  const [result] = await db
    .select()
    .from(eventDefinitions)
    .where(and(eq(eventDefinitions.projectId, projectId), eq(eventDefinitions.id, id)))
    .limit(1);

  if (!result) {
    return result;
  }

  const triggerSpans = await db
    .select({
      name: summaryTriggerSpans.spanName,
    })
    .from(summaryTriggerSpans)
    .where(and(eq(summaryTriggerSpans.projectId, projectId), eq(summaryTriggerSpans.eventName, result.name)));

  return {
    ...result,
    triggerSpans: triggerSpans.map((s) => s.name),
  };
}

export async function createEventDefinition(input: z.infer<typeof CreateEventDefinitionSchema>) {
  const { projectId, name, prompt, structuredOutput, triggerSpans } = CreateEventDefinitionSchema.parse(input);

  const [result] = await db
    .insert(eventDefinitions)
    .values({
      projectId,
      name,
      prompt,
      structuredOutput,
      isSemantic: true,
    })
    .returning();

  if (triggerSpans.length > 0) {
    await db.insert(summaryTriggerSpans).values(
      triggerSpans.map((spanName) => ({
        projectId,
        eventName: name,
        spanName,
      }))
    );
    await cache.remove(`${SUMMARY_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);
  }

  return result;
}

export async function updateEventDefinition(input: z.infer<typeof UpdateEventDefinitionSchema>) {
  const { projectId, id, prompt, structuredOutput, triggerSpans } = UpdateEventDefinitionSchema.parse(input);

  const result = await db.transaction(async (tx) => {
    const [result] = await tx
      .update(eventDefinitions)
      .set({ prompt, structuredOutput })
      .where(and(eq(eventDefinitions.projectId, projectId), eq(eventDefinitions.id, id)))
      .returning();

    await syncTriggerSpans(tx, projectId, result.name, triggerSpans);

    return result;
  });

  await cache.remove(`${SUMMARY_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);

  return result;
}

const syncTriggerSpans = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
  eventName: string,
  targetSpans: string[]
) => {
  const currentSpans = await tx
    .select({ spanName: summaryTriggerSpans.spanName })
    .from(summaryTriggerSpans)
    .where(and(eq(summaryTriggerSpans.eventName, eventName), eq(summaryTriggerSpans.projectId, projectId)));

  const currentSpanNames = currentSpans.map((s) => s.spanName);

  const toAdd = difference(targetSpans, currentSpanNames);
  const toRemove = difference(currentSpanNames, targetSpans);

  const deletions =
    toRemove.length > 0
      ? tx
        .delete(summaryTriggerSpans)
        .where(
          and(
            eq(summaryTriggerSpans.projectId, projectId),
            eq(summaryTriggerSpans.eventName, eventName),
            inArray(summaryTriggerSpans.spanName, toRemove)
          )
        )
      : Promise.resolve();

  const insertions =
    toAdd.length > 0
      ? tx.insert(summaryTriggerSpans).values(toAdd.map((spanName) => ({ projectId, eventName, spanName })))
      : Promise.resolve();

  await Promise.all([deletions, insertions]);
};

export async function deleteEventDefinition(input: z.infer<typeof DeleteEventDefinitionSchema>) {
  const { projectId, id } = DeleteEventDefinitionSchema.parse(input);

  const [result] = await db
    .delete(eventDefinitions)
    .where(and(eq(eventDefinitions.projectId, projectId), eq(eventDefinitions.id, id)))
    .returning();

  await cache.remove(`${SUMMARY_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);

  return result;
}

export async function deleteEventDefinitions(input: z.infer<typeof DeleteEventDefinitionsSchema>) {
  const { projectId, ids } = DeleteEventDefinitionsSchema.parse(input);

  const events = await db
    .delete(eventDefinitions)
    .where(and(eq(eventDefinitions.projectId, projectId), inArray(eventDefinitions.id, ids)))
    .returning();

  if (events.length > 0) {
    try {
      await clickhouseClient.command({
        query: `
          DELETE FROM events
          WHERE project_id = {projectId: UUID}
            AND name IN ({eventNames: Array(String)})
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

  await cache.remove(`${SUMMARY_TRIGGER_SPANS_CACHE_KEY}:${projectId}`);

  return { success: true };
}
