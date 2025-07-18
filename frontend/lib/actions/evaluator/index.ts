import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluators } from "@/lib/db/migrations/schema";

export const UpdateEvaluatorSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string(),
  name: z.string().min(1, { error: "Name is required" }).max(255, { error: "Name must be less than 255 characters" }),
  definition: z.object({
    function_code: z.string().min(1, { error: "Function code is required" }),
  }),
});

export async function updateEvaluator(input: z.infer<typeof UpdateEvaluatorSchema>) {
  const { projectId, evaluatorId, name, definition } = UpdateEvaluatorSchema.parse(input);

  const [updatedEvaluator] = await db
    .update(evaluators)
    .set({
      name,
      definition,
    })
    .where(and(eq(evaluators.id, evaluatorId), eq(evaluators.projectId, projectId)))
    .returning();

  if (!updatedEvaluator) {
    throw new Error("Evaluator not found");
  }

  return updatedEvaluator;
}
