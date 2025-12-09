import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { eventClusterConfigs } from "@/lib/db/migrations/schema";

export type EventClusterConfig = {
  id: string;
  createdAt: string;
  eventName: string;
  valueTemplate: string;
  projectId: string;
  eventSource: string;
};

export const GetClusterConfigSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
  eventSource: z.enum(["semantic", "code"]),
});

export const CreateClusterConfigSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
  valueTemplate: z.string().min(1, "Value template is required"),
  eventSource: z.enum(["semantic", "code"]),
});

export const DeleteClusterConfigSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
  eventSource: z.enum(["semantic", "code"]),
});

export async function getClusterConfig(
  input: z.infer<typeof GetClusterConfigSchema>
): Promise<EventClusterConfig | undefined> {
  const { projectId, eventName, eventSource } = GetClusterConfigSchema.parse(input);

  const whereConditions = [
    eq(eventClusterConfigs.projectId, projectId),
    eq(eventClusterConfigs.eventName, eventName),
    eq(eventClusterConfigs.eventSource, eventSource)
  ];

  const [result] = await db
    .select()
    .from(eventClusterConfigs)
    .where(and(...whereConditions))
    .limit(1);

  return result ?? undefined;
}

export async function createClusterConfig(
  input: z.infer<typeof CreateClusterConfigSchema>
): Promise<EventClusterConfig> {
  const { projectId, eventName, valueTemplate, eventSource } = CreateClusterConfigSchema.parse(input);

  const [result] = await db
    .insert(eventClusterConfigs)
    .values({
      projectId,
      eventName,
      valueTemplate,
      eventSource,
    })
    .returning();

  return result;
}

export async function deleteClusterConfig(
  input: z.infer<typeof DeleteClusterConfigSchema>
): Promise<EventClusterConfig | undefined> {
  const { projectId, eventName, eventSource } = DeleteClusterConfigSchema.parse(input);

  const whereConditions = [
    eq(eventClusterConfigs.projectId, projectId),
    eq(eventClusterConfigs.eventName, eventName),
  ];

  if (eventSource) {
    whereConditions.push(eq(eventClusterConfigs.eventSource, eventSource));
  }

  const [result] = await db
    .delete(eventClusterConfigs)
    .where(and(...whereConditions))
    .returning();

  return result ?? undefined;
}

