import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { eventDefinitions } from "@/lib/db/migrations/schema";

export const GetEventDefinitionsSchema = z.object({
  projectId: z.string(),
});

export const GetEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const CreateEventDefinitionSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, { error: "Name is required" }).max(255, { error: "Name must be less than 255 characters" }),
  prompt: z.string().nullable(),
  structuredOutput: z.record(z.string(), z.unknown()).nullable(),
});

export const UpdateEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  prompt: z.string().nullable(),
  structuredOutput: z.record(z.string(), z.unknown()).nullable(),
});

export const DeleteEventDefinitionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export async function getEventDefinitions(input: z.infer<typeof GetEventDefinitionsSchema>) {
  const { projectId } = GetEventDefinitionsSchema.parse(input);

  const results = await db
    .select()
    .from(eventDefinitions)
    .where(eq(eventDefinitions.projectId, projectId))
    .orderBy(desc(eventDefinitions.createdAt));

  return results;
}

export async function getEventDefinition(input: z.infer<typeof GetEventDefinitionSchema>) {
  const { id, projectId } = GetEventDefinitionSchema.parse(input);

  const [result] = await db
    .select()
    .from(eventDefinitions)
    .where(and(eq(eventDefinitions.projectId, projectId), eq(eventDefinitions.id, id)))
    .limit(1);

  return result;
}

export async function createEventDefinition(input: z.infer<typeof CreateEventDefinitionSchema>) {
  const { projectId, name, prompt } = CreateEventDefinitionSchema.parse(input);

  const [result] = await db
    .insert(eventDefinitions)
    .values({
      projectId,
      name,
      prompt,
    })
    .returning();

  return result;
}

export async function updateEventDefinition(input: z.infer<typeof UpdateEventDefinitionSchema>) {
  const { projectId, id, prompt, structuredOutput } = UpdateEventDefinitionSchema.parse(input);

  const [result] = await db
    .update(eventDefinitions)
    .set({
      prompt,
      structuredOutput,
    })
    .where(and(eq(eventDefinitions.projectId, projectId), eq(eventDefinitions.id, id)))
    .returning();

  return result;
}

export async function deleteEventDefinition(input: z.infer<typeof DeleteEventDefinitionSchema>) {
  const { projectId, id } = DeleteEventDefinitionSchema.parse(input);

  const [result] = await db
    .delete(eventDefinitions)
    .where(and(eq(eventDefinitions.projectId, projectId), eq(eventDefinitions.id, id)))
    .returning();

  return result;
}
