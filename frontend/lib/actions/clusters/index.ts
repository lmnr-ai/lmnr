import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { parseFilters } from "@/lib/db/filter-parser";
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

export const GetClustersSchema = z.object({
  projectId: z.string(),
  pageNumber: z.coerce.number().default(0),
  pageSize: z.coerce.number().default(50),
  search: z.string().nullable().optional(),
  filter: z.array(z.any()).optional().default([]),
});

export async function getClusters(input: z.infer<typeof GetClustersSchema> | string): Promise<{ items: Cluster[] }> {
  const { projectId, pageNumber, pageSize, search, filter } =
    typeof input === "string"
      ? GetClustersSchema.parse({ projectId: input, pageNumber: 0, pageSize: 50 })
      : GetClustersSchema.parse(input);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(clusters.projectId, projectId)];

  if (search) {
    whereConditions.push(ilike(clusters.name, `%${search}%`));
  }

  if (filter && Array.isArray(filter)) {
    const filterConditions = parseFilters(filter, {
      name: { column: clusters.name, type: "string" },
      level: { column: clusters.level, type: "number" },
      numTraces: { column: clusters.numTraces, type: "number" },
    });
    whereConditions.push(...filterConditions);
  }

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

  const items = result.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    parentId: row.parentId,
    level: Number(row.level),
    numChildrenClusters: Number(row.numChildrenClusters),
    numTraces: Number(row.numTraces),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return {
    items,
  };
}
