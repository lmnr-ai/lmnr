import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { summaryTriggerSpans } from "@/lib/db/migrations/schema";

export const GetSummaryTriggerSpansSchema = z.object({
  projectId: z.string(),
});

export const GetSummaryTriggerSpanSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const CreateSummaryTriggerSpanSchema = z.object({
  projectId: z.string(),
  spanName: z
    .string()
    .min(1, "Span name is required")
    .max(255, { error: "Span name must be less than 255 characters" }),
  eventName: z.string().nullable(),
});

export const DeleteSummaryTriggerSpanSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export async function getSummaryTriggerSpans(input: z.infer<typeof GetSummaryTriggerSpansSchema>) {
  const { projectId } = GetSummaryTriggerSpansSchema.parse(input);

  const results = await db.select().from(summaryTriggerSpans).where(eq(summaryTriggerSpans.projectId, projectId));

  return results;
}

export async function getUnassignedSummaryTriggerSpans(input: z.infer<typeof GetSummaryTriggerSpansSchema>) {
  const { projectId } = GetSummaryTriggerSpansSchema.parse(input);

  const results = await db
    .select()
    .from(summaryTriggerSpans)
    .where(and(eq(summaryTriggerSpans.projectId, projectId), isNull(summaryTriggerSpans.eventName)));

  return results;
}

export async function getSummaryTriggerSpan(input: z.infer<typeof GetSummaryTriggerSpanSchema>) {
  const { id, projectId } = GetSummaryTriggerSpanSchema.parse(input);

  const [result] = await db
    .select()
    .from(summaryTriggerSpans)
    .where(and(eq(summaryTriggerSpans.projectId, projectId), eq(summaryTriggerSpans.id, id)))
    .limit(1);

  return result;
}

export async function createSummaryTriggerSpan(input: z.infer<typeof CreateSummaryTriggerSpanSchema>) {
  const { projectId, spanName, eventName } = CreateSummaryTriggerSpanSchema.parse(input);

  const [result] = await db
    .insert(summaryTriggerSpans)
    .values({
      projectId,
      spanName,
      eventName,
    })
    .returning();

  return result;
}

export async function deleteSummaryTriggerSpan(input: z.infer<typeof DeleteSummaryTriggerSpanSchema>) {
  const { projectId, id } = DeleteSummaryTriggerSpanSchema.parse(input);

  const [result] = await db
    .delete(summaryTriggerSpans)
    .where(and(eq(summaryTriggerSpans.projectId, projectId), eq(summaryTriggerSpans.id, id)))
    .returning();

  return result;
}
