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
};

export const GetClusterConfigSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
});

export const CreateClusterConfigSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
  valueTemplate: z.string().min(1, "Value template is required"),
});

export const DeleteClusterConfigSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
});

export async function getClusterConfig(
  input: z.infer<typeof GetClusterConfigSchema>
): Promise<EventClusterConfig | undefined> {
  const { projectId, eventName } = GetClusterConfigSchema.parse(input);

  const [result] = await db
    .select()
    .from(eventClusterConfigs)
    .where(
      and(
        eq(eventClusterConfigs.projectId, projectId),
        eq(eventClusterConfigs.eventName, eventName)
      )
    )
    .limit(1);

  return result ?? undefined;
}

export async function createClusterConfig(
  input: z.infer<typeof CreateClusterConfigSchema>
): Promise<EventClusterConfig> {
  const { projectId, eventName, valueTemplate } = CreateClusterConfigSchema.parse(input);

  const [result] = await db
    .insert(eventClusterConfigs)
    .values({
      projectId,
      eventName,
      valueTemplate,
    })
    .returning();

  return result;
}

export async function deleteClusterConfig(
  input: z.infer<typeof DeleteClusterConfigSchema>
): Promise<EventClusterConfig | undefined> {
  const { projectId, eventName } = DeleteClusterConfigSchema.parse(input);

  const [result] = await db
    .delete(eventClusterConfigs)
    .where(
      and(
        eq(eventClusterConfigs.projectId, projectId),
        eq(eventClusterConfigs.eventName, eventName)
      )
    )
    .returning();

  return result ?? undefined;
}

