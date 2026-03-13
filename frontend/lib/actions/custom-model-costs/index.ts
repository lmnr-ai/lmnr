import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { HttpError } from "@/lib/api/route-handler";
import { db } from "@/lib/db/drizzle";
import { customModelCosts } from "@/lib/db/migrations/schema";

import { invalidateCustomModelCostsCache } from "./invalidate-cache";

const GetCustomModelCostsSchema = z.object({
  projectId: z.string(),
});

const UpsertCustomModelCostSchema = z.object({
  id: z.string().optional(),
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
  provider: string;
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
    .orderBy(customModelCosts.createdAt);

  return rows as CustomModelCost[];
}

export class DuplicateModelCostError extends HttpError {
  constructor() {
    super("A cost entry for this provider and model already exists", 409);
    this.name = "DuplicateModelCostError";
  }
}

async function checkDuplicate(projectId: string, provider: string, model: string, excludeId?: string) {
  const existing = await db
    .select({ id: customModelCosts.id })
    .from(customModelCosts)
    .where(
      and(
        eq(customModelCosts.projectId, projectId),
        eq(customModelCosts.provider, provider),
        eq(customModelCosts.model, model)
      )
    )
    .limit(1);

  if (existing.length > 0 && existing[0].id !== excludeId) {
    throw new DuplicateModelCostError();
  }
}

export async function upsertCustomModelCost(
  input: z.infer<typeof UpsertCustomModelCostSchema>
): Promise<{ result: CustomModelCost }> {
  const parsed = UpsertCustomModelCostSchema.parse(input);
  const { id, projectId } = parsed;
  const provider = (parsed.provider ?? "").toLowerCase();
  const model = parsed.model.toLowerCase();
  const costs = parsed.costs;

  await checkDuplicate(projectId, provider, model, id);

  let result: CustomModelCost;

  if (id) {
    const [row] = await db
      .update(customModelCosts)
      .set({ provider, model, costs, updatedAt: new Date().toISOString() })
      .where(and(eq(customModelCosts.id, id), eq(customModelCosts.projectId, projectId)))
      .returning();

    if (!row) {
      throw new Error("Custom model cost not found");
    }

    result = row as CustomModelCost;
  } else {
    const [row] = await db.insert(customModelCosts).values({ projectId, provider, model, costs }).returning();
    result = row as CustomModelCost;
  }

  // Invalidate cache for the old provider+model if it was renamed
  if (parsed.previousModel) {
    const prevProvider = (parsed.previousProvider ?? "").toLowerCase();
    const prevModel = parsed.previousModel.toLowerCase();
    await invalidateCustomModelCostsCache(projectId, prevProvider, prevModel);
  }
  await invalidateCustomModelCostsCache(projectId, result.provider, result.model);

  return { result };
}

export async function deleteCustomModelCost(
  input: z.infer<typeof DeleteCustomModelCostSchema>
): Promise<{ model: string; provider: string }> {
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

  await invalidateCustomModelCostsCache(projectId, result[0].provider, result[0].model);

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

  // Fetch existing target costs before copy so we can invalidate their cache entries
  const existingTargetCosts = await getCustomModelCosts({ projectId: targetProjectId });

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

  const result = newRows as CustomModelCost[];

  // Invalidate cache for previously existing models in target (now deleted/replaced)
  const invalidations = existingTargetCosts.map((cost) =>
    invalidateCustomModelCostsCache(targetProjectId, cost.provider, cost.model)
  );
  // Also invalidate cache for newly copied models in target
  for (const cost of result) {
    invalidations.push(invalidateCustomModelCostsCache(targetProjectId, cost.provider, cost.model));
  }
  await Promise.all(invalidations);

  return result;
}
