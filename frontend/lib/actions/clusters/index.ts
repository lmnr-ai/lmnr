import {and, desc, eq, ilike, ne, sql} from "drizzle-orm";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { db } from "@/lib/db/drizzle";
import { eventClusters } from "@/lib/db/migrations/schema";
import { PaginatedResponse } from "@/lib/types.ts";

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

export const GetEventClustersSchema = PaginationFiltersSchema.extend({
  projectId: z.string(),
  eventName: z.string(),
  search: z.string().nullable().optional(),
});

export async function getEventClusters(
  input: z.infer<typeof GetEventClustersSchema>
): Promise<PaginatedResponse<EventCluster>> {
  const { projectId, eventName, pageNumber, pageSize, search, filter } = input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [
    eq(eventClusters.projectId, projectId),
    eq(eventClusters.eventName, eventName),
    ne(eventClusters.level, 0),
  ];

  if (search) {
    whereConditions.push(ilike(eventClusters.name, `%${search}%`));
  }

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: eventClusters.name },
    numChildrenClusters: { type: "number", column: eventClusters.numChildrenClusters },
    numEvents: { type: "number", column: eventClusters.numEvents },
  } as const);
  whereConditions.push(...filterConditions);

  const [total] = await db
    .select({
      count: sql<number>`COALESCE(SUM(${eventClusters.numEvents}), 0)`,
    })
    .from(eventClusters)
    .where(and(
      eq(eventClusters.projectId, projectId),
      eq(eventClusters.eventName, eventName),
      eq(eventClusters.level, 1),
    ));

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
    .orderBy(desc(eventClusters.numEvents), eventClusters.level, eventClusters.createdAt)
    .limit(limit)
    .offset(offset);

  return {
    items: result,
    totalCount: total.count
  };
}
