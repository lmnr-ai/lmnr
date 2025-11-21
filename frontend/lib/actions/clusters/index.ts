"use server";

import { desc, eq } from "drizzle-orm";

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
  centroid: number[];
  createdAt: string;
  updatedAt: string;
};

export async function getClusters(projectId: string): Promise<Cluster[]> {
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
    .where(eq(clusters.projectId, projectId))
    .orderBy(desc(clusters.numTraces), clusters.level, clusters.createdAt);

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
