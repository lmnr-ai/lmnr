import { and, eq, sql } from "drizzle-orm";
import { sample } from "lodash";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluations, tagClasses } from "@/lib/db/migrations/schema";
import { defaultColors } from "@/lib/tags/colors";

const EvaluationTagSchema = z.object({
  projectId: z.guid(),
  evaluationId: z.guid(),
  name: z.string().trim().min(1),
});

const GetEvaluationTagsSchema = z.object({
  projectId: z.guid(),
  evaluationId: z.guid(),
});

export const getEvaluationTags = async (input: z.infer<typeof GetEvaluationTagsSchema>): Promise<string[]> => {
  const { projectId, evaluationId } = GetEvaluationTagsSchema.parse(input);

  const [evaluation] = await db
    .select({ tags: evaluations.tags })
    .from(evaluations)
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)))
    .limit(1);

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  return evaluation.tags;
};

/**
 * Attach a tag to an evaluation, registering the tag class first when it's new
 * so the name resolves to a color in the pickers. `array_append` is guarded by
 * a `NOT tags @> …` so re-attaching stays idempotent.
 */
export const addEvaluationTag = async (input: z.infer<typeof EvaluationTagSchema>): Promise<string[]> => {
  const { projectId, evaluationId, name } = EvaluationTagSchema.parse(input);

  await db
    .insert(tagClasses)
    .values({ projectId, name, color: sample(defaultColors)!.color })
    .onConflictDoNothing();

  const updated = await db
    .update(evaluations)
    .set({
      tags: sql`CASE WHEN ${evaluations.tags} @> ARRAY[${name}]::text[]
        THEN ${evaluations.tags}
        ELSE array_append(${evaluations.tags}, ${name})
      END`,
    })
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)))
    .returning({ tags: evaluations.tags });

  if (updated.length === 0) {
    throw new Error("Evaluation not found");
  }

  return updated[0].tags;
};

export const removeEvaluationTag = async (input: z.infer<typeof EvaluationTagSchema>): Promise<string[]> => {
  const { projectId, evaluationId, name } = EvaluationTagSchema.parse(input);

  const updated = await db
    .update(evaluations)
    .set({ tags: sql`array_remove(${evaluations.tags}, ${name})` })
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)))
    .returning({ tags: evaluations.tags });

  if (updated.length === 0) {
    throw new Error("Evaluation not found");
  }

  return updated[0].tags;
};
