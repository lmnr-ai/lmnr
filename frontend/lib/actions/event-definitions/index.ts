import { and, desc, eq, gte, ilike, inArray, isNotNull, lte } from "drizzle-orm";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { cache, SUMMARY_TRIGGER_SPANS_CACHE_KEY } from "@/lib/cache.ts";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { eventDefinitions, summaryTriggerSpans } from "@/lib/db/migrations/schema";

export type EventDefinitionRow = Omit<EventDefinition, "prompt" | "structuredOutput">;

export type EventDefinition = {
  id: string;
  name: string;
  createdAt: string;
  projectId: string;
  prompt: string | null;
  structuredOutput: Record<string, unknown> | null;
  triggerSpans: string[];
};

export const GetEventDefinitionsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
});

export const GetEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const DeleteEventDefinitionsSchema = z.object({
  projectId: z.string(),
  ids: z.array(z.string()).min(1, "At least one event definition ID is required"),
});

export async function getEventDefinitions(input: z.infer<typeof GetEventDefinitionsSchema>) {
  const { projectId, pastHours, startDate, endDate, search, pageNumber, pageSize, filter } = input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(eventDefinitions.projectId, projectId)];

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

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: eventDefinitions.name },
    id: { type: "string", column: eventDefinitions.id },
  } as const);

  whereConditions.push(...filterConditions);

  const results = await db
    .select({
      id: eventDefinitions.id,
      createdAt: eventDefinitions.createdAt,
      name: eventDefinitions.name,
      projectId: eventDefinitions.projectId,
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

  const items = results.map((eventDef) => ({
    ...eventDef,
    triggerSpans: triggerSpansByEvent[eventDef.name] || [],
  }));

  return {
    items,
  };
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
            AND source = 'code'
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
