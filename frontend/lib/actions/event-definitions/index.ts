import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { difference } from "lodash";
import { z } from "zod/v4";

import { cache, SUMMARY_TRIGGER_SPANS_CACHE_KEY } from "@/lib/cache.ts";
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
  isSemantic: boolean;
  triggerSpans: string[];
};

export const GetEventDefinitionsSchema = z.object({
  projectId: z.string(),
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

export async function getEventDefinitions(input: z.infer<typeof GetEventDefinitionsSchema>) {
  const { projectId } = GetEventDefinitionsSchema.parse(input);

  const results = await db
    .select({
      id: eventDefinitions.id,
      createdAt: eventDefinitions.createdAt,
      name: eventDefinitions.name,
      projectId: eventDefinitions.projectId,
      isSemantic: eventDefinitions.isSemantic,
    })
    .from(eventDefinitions)
    .where(eq(eventDefinitions.projectId, projectId))
    .orderBy(desc(eventDefinitions.createdAt));

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
