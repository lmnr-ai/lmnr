import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { db } from "@/lib/db/drizzle";
import { clusters, projects } from "@/lib/db/migrations/schema";

export type Cluster = {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  level: number;
  numChildrenClusters: number;
  numTraces: number;
  createdAt: string;
  updatedAt: string;
};

export const GetClustersSchema = PaginationFiltersSchema.extend({
  projectId: z.string(),
  search: z.string().nullable().optional(),
});

export async function getClusters(input: z.infer<typeof GetClustersSchema>): Promise<{ items: Cluster[] }> {
  const { projectId, pageNumber, pageSize, search, filter } = input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(clusters.projectId, projectId)];

  if (search) {
    whereConditions.push(ilike(clusters.name, `%${search}%`));
  }

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: clusters.name },
    numChildrenClusters: { type: "number", column: clusters.numChildrenClusters },
    numTraces: { type: "number", column: clusters.numTraces },
  } as const);
  whereConditions.push(...filterConditions);

  const result = await db
    .select({
      id: clusters.id,
      projectId: clusters.projectId,
      name: clusters.name,
      parentId: clusters.parentId,
      level: clusters.level,
      numChildrenClusters: clusters.numChildrenClusters,
      numTraces: clusters.numTraces,
      createdAt: clusters.createdAt,
      updatedAt: clusters.updatedAt,
    })
    .from(clusters)
    .innerJoin(projects, eq(clusters.projectId, projects.id))
    .where(and(...whereConditions))
    .orderBy(desc(clusters.numTraces), clusters.level, clusters.createdAt)
    .limit(limit)
    .offset(offset);

  return {
    items: result,
  };
}
