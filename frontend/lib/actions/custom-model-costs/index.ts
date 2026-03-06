import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { customModelCosts, projects } from "@/lib/db/migrations/schema";

const GetCustomModelCostsSchema = z.object({
  projectId: z.string(),
});

const UpsertCustomModelCostSchema = z.object({
  projectId: z.string(),
  provider: z.string().optional(),
  model: z.string().min(1, "Model name is required"),
  costs: z.record(z.string(), z.number()),
});

const DeleteCustomModelCostSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

const CopyCustomModelCostsSchema = z.object({
  sourceProjectId: z.string(),
  targetProjectId: z.string(),
});

export type CustomModelCost = {
  id: string;
  projectId: string;
  provider: string | null;
  model: string;
  costs: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export async function getCustomModelCosts(
  input: z.infer<typeof GetCustomModelCostsSchema>
): Promise<CustomModelCost[]> {
  const { projectId } = GetCustomModelCostsSchema.parse(input);

  const rows = await db
    .select({
      id: customModelCosts.id,
      projectId: customModelCosts.projectId,
      provider: customModelCosts.provider,
      model: customModelCosts.model,
      costs: customModelCosts.costs,
      createdAt: customModelCosts.createdAt,
      updatedAt: customModelCosts.updatedAt,
    })
    .from(customModelCosts)
    .where(eq(customModelCosts.projectId, projectId))
    .orderBy(customModelCosts.model);

  return rows as CustomModelCost[];
}

export async function upsertCustomModelCost(
  input: z.infer<typeof UpsertCustomModelCostSchema>
): Promise<CustomModelCost> {
  const { projectId, provider, model, costs } = UpsertCustomModelCostSchema.parse(input);

  const [row] = await db
    .insert(customModelCosts)
    .values({
      projectId,
      provider: provider || null,
      model,
      costs,
    })
    .onConflictDoUpdate({
      target: [customModelCosts.projectId, customModelCosts.model],
      set: {
        provider: provider || null,
        costs,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();

  return row as CustomModelCost;
}

export async function deleteCustomModelCost(
  input: z.infer<typeof DeleteCustomModelCostSchema>
): Promise<{ model: string; provider: string | null }> {
  const { projectId, id } = DeleteCustomModelCostSchema.parse(input);

  const result = await db
    .delete(customModelCosts)
    .where(and(eq(customModelCosts.id, id), eq(customModelCosts.projectId, projectId)))
    .returning({
      model: customModelCosts.model,
      provider: customModelCosts.provider,
    });

  if (!result || result.length === 0) {
    throw new Error("Custom model cost not found");
  }

  return result[0];
}

export async function copyCustomModelCosts(
  input: z.infer<typeof CopyCustomModelCostsSchema>
): Promise<CustomModelCost[]> {
  const { sourceProjectId, targetProjectId } = CopyCustomModelCostsSchema.parse(input);

  // Verify target project exists
  const targetProject = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, targetProjectId))
    .limit(1);

  if (targetProject.length === 0) {
    throw new Error("Target project not found");
  }

  // Get source costs
  const sourceCosts = await getCustomModelCosts({
    projectId: sourceProjectId,
  });

  if (sourceCosts.length === 0) {
    throw new Error("No custom model costs found in source project");
  }

  // Delete existing costs in target project
  await db.delete(customModelCosts).where(eq(customModelCosts.projectId, targetProjectId));

  // Insert source costs into target project
  const newRows = await db
    .insert(customModelCosts)
    .values(
      sourceCosts.map((cost) => ({
        projectId: targetProjectId,
        provider: cost.provider,
        model: cost.model,
        costs: cost.costs,
      }))
    )
    .returning();

  return newRows as CustomModelCost[];
}
