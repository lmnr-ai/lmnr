import { and, asc, eq } from "drizzle-orm";
import { sample } from "lodash";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluations, evaluationTags, tagClasses } from "@/lib/db/migrations/schema";
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

const listTags = async (projectId: string, evaluationId: string): Promise<string[]> => {
  const rows = await db
    .select({ name: evaluationTags.name })
    .from(evaluationTags)
    .where(and(eq(evaluationTags.projectId, projectId), eq(evaluationTags.evaluationId, evaluationId)))
    .orderBy(asc(evaluationTags.createdAt));

  return rows.map((row) => row.name);
};

export const getEvaluationTags = async (input: z.infer<typeof GetEvaluationTagsSchema>): Promise<string[]> => {
  const { projectId, evaluationId } = GetEvaluationTagsSchema.parse(input);
  return listTags(projectId, evaluationId);
};

/**
 * Attach a tag to an evaluation, registering the tag class first when it's new —
 * `evaluation_tags` has a composite FK onto `tag_classes(name, project_id)`.
 */
export const addEvaluationTag = async (input: z.infer<typeof EvaluationTagSchema>): Promise<string[]> => {
  const { projectId, evaluationId, name } = EvaluationTagSchema.parse(input);

  const [evaluation] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)))
    .limit(1);

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  await db
    .insert(tagClasses)
    .values({ projectId, name, color: sample(defaultColors)!.color })
    .onConflictDoNothing();

  await db.insert(evaluationTags).values({ projectId, evaluationId, name }).onConflictDoNothing();

  return listTags(projectId, evaluationId);
};

export const removeEvaluationTag = async (input: z.infer<typeof EvaluationTagSchema>): Promise<string[]> => {
  const { projectId, evaluationId, name } = EvaluationTagSchema.parse(input);

  await db
    .delete(evaluationTags)
    .where(
      and(
        eq(evaluationTags.projectId, projectId),
        eq(evaluationTags.evaluationId, evaluationId),
        eq(evaluationTags.name, name)
      )
    );

  return listTags(projectId, evaluationId);
};
