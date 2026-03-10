import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { customModelCosts } from "@/lib/db/migrations/schema";

const GetCustomModelCostsSchema = z.object({
  projectId: z.string(),
});

const UpsertCustomModelCostSchema = z.object({
  projectId: z.string(),
  provider: z.string().optional(),
  model: z.string().min(1, "Model name is required"),
  costs: z.record(z.string(), z.number().nonnegative("Cost values must not be negative")),
  previousModel: z.string().optional(),
  previousProvider: z.string().optional(),
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
): Promise<{ result: CustomModelCost; deletedModel?: string; deletedProvider?: string | null }> {
  const parsed = UpsertCustomModelCostSchema.parse(input);
  const projectId = parsed.projectId;
  // Lowercase provider and model to match the Rust backend's span attribute
  // normalization before DB queries and cache key construction.
  const provider = parsed.provider?.toLowerCase();
  const model = parsed.model.toLowerCase();
  const costs = parsed.costs;
  const previousModel = parsed.previousModel?.toLowerCase();
  const previousProvider = parsed.previousProvider?.toLowerCase();

  // A re-key happens when model or provider changed during edit.
  // Both previousModel and previousProvider are sent together from the UI.
  const isRekey = previousModel !== undefined;

  if (isRekey) {
    // Wrap delete + upsert in a transaction so the old entry is not lost if the upsert fails
    const txResult = await db.transaction(async (tx) => {
      // Delete the old entry using previous provider+model to match the unique constraint
      const prevProv = previousProvider || null;
      const deleted = await tx
        .delete(customModelCosts)
        .where(
          and(
            eq(customModelCosts.projectId, projectId),
            prevProv === null ? isNull(customModelCosts.provider) : eq(customModelCosts.provider, prevProv),
            eq(customModelCosts.model, previousModel)
          )
        )
        .returning({ model: customModelCosts.model, provider: customModelCosts.provider });

      const [row] = await tx
        .insert(customModelCosts)
        .values({ projectId, provider: provider || null, model, costs })
        .onConflictDoUpdate({
          target: [customModelCosts.projectId, customModelCosts.provider, customModelCosts.model],
          set: { costs, updatedAt: new Date().toISOString() },
        })
        .returning();

      return {
        result: row as CustomModelCost,
        deleted: deleted.length > 0 ? deleted[0] : null,
      };
    });

    return {
      result: txResult.result,
      deletedModel: txResult.deleted?.model,
      deletedProvider: txResult.deleted?.provider,
    };
  }

  const [row] = await db
    .insert(customModelCosts)
    .values({ projectId, provider: provider || null, model, costs })
    .onConflictDoUpdate({
      target: [customModelCosts.projectId, customModelCosts.provider, customModelCosts.model],
      set: { costs, updatedAt: new Date().toISOString() },
    })
    .returning();

  return { result: row as CustomModelCost };
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

  // Get source costs
  const sourceCosts = await getCustomModelCosts({
    projectId: sourceProjectId,
  });

  if (sourceCosts.length === 0) {
    return [];
  }

  // Delete + insert in a transaction so target data is not lost if insert fails
  const newRows = await db.transaction(async (tx) => {
    await tx.delete(customModelCosts).where(eq(customModelCosts.projectId, targetProjectId));

    return await tx
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
  });

  return newRows as CustomModelCost[];
}
