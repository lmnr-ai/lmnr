import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { eventClusters } from "@/lib/db/migrations/schema";

export type EventCluster = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  numChildrenClusters: number;
  numEvents: number;
  createdAt: string;
  updatedAt: string;
};

export const GetEventClustersSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
  eventSource: z.enum(["semantic", "code"]),
});

export async function getEventClusters(
  input: z.infer<typeof GetEventClustersSchema>
): Promise<{ items: EventCluster[] }> {
  const { projectId, eventName, eventSource } = input;

  const whereConditions = [
    eq(eventClusters.projectId, projectId),
    eq(eventClusters.eventName, eventName),
    ne(eventClusters.level, 0),
  ];

  if (eventSource) {
    whereConditions.push(eq(eventClusters.eventSource, eventSource));
  }

  const result = await db
    .select({
      id: eventClusters.id,
      name: eventClusters.name,
      parentId: eventClusters.parentId,
      level: eventClusters.level,
      numChildrenClusters: eventClusters.numChildrenClusters,
      numEvents: eventClusters.numEvents,
      createdAt: eventClusters.createdAt,
      updatedAt: eventClusters.updatedAt,
    })
    .from(eventClusters)
    .where(and(...whereConditions))
    .orderBy(desc(eventClusters.numEvents), eventClusters.level, eventClusters.createdAt);

  return {
    items: result,
  };
}
