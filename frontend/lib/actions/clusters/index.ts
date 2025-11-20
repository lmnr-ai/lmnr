import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { clusters, projects } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";

export type Cluster = {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  level: number;
  numChildrenClusters: number;
  numTraces: number;
  centroid: number[];
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

export async function getClusters(
  input: z.infer<typeof GetClustersSchema> | string
): Promise<Cluster[]> {
  // Support legacy signature for backward compatibility
  const { projectId, pageNumber, pageSize, search, filter } =
    typeof input === "string"
      ? GetClustersSchema.parse({ projectId: input, pageNumber: 0, pageSize: 50 })
      : GetClustersSchema.parse(input);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(clusters.projectId, projectId)];

  // Add search condition
  if (search) {
    whereConditions.push(ilike(clusters.name, `%${search}%`));
  }

  // Add filter conditions
  if (filter && Array.isArray(filter)) {
    filter.forEach((filterItem) => {
      try {
        const f: FilterDef = typeof filterItem === "string" ? JSON.parse(filterItem) : filterItem;
        const { column, operator, value } = f;

        if (column === "name") {
          if (operator === "eq") whereConditions.push(eq(clusters.name, value));
          else if (operator === "contains") whereConditions.push(ilike(clusters.name, `%${value}%`));
        } else if (column === "level") {
          const numValue = Number(value);
          if (operator === "eq") whereConditions.push(eq(clusters.level, numValue));
          else if (operator === "gt") whereConditions.push(gte(clusters.level, numValue));
          else if (operator === "lt") whereConditions.push(lte(clusters.level, numValue));
        } else if (column === "numTraces") {
          const numValue = Number(value);
          if (operator === "eq") whereConditions.push(eq(clusters.numTraces, numValue));
          else if (operator === "gt") whereConditions.push(gte(clusters.numTraces, numValue));
          else if (operator === "lt") whereConditions.push(lte(clusters.numTraces, numValue));
        }
      } catch (error) {
        // Skip invalid filter
      }
    });
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
      centroid: clusters.centroid,
      createdAt: clusters.createdAt,
      updatedAt: clusters.updatedAt,
    })
    .from(clusters)
    .innerJoin(projects, eq(clusters.projectId, projects.id))
    .where(and(...whereConditions))
    .orderBy(desc(clusters.numTraces), clusters.level, clusters.createdAt)
    .limit(limit)
    .offset(offset);

  return result.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    parentId: row.parentId,
    level: Number(row.level),
    numChildrenClusters: Number(row.numChildrenClusters),
    numTraces: Number(row.numTraces),
    centroid: row.centroid as number[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
