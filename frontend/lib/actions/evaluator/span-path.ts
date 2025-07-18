import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluatorSpanPaths } from "@/lib/db/migrations/schema";

export const RegisterEvaluatorToSpanPathSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string(),
  spanPath: z
    .array(z.string().min(1, { error: "Span path elements cannot be empty" }))
    .min(1, { error: "Span path must contain at least one element" }),
});

export const UnregisterEvaluatorFromSpanPathSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string(),
  spanPath: z
    .array(z.string().min(1, { error: "Span path elements cannot be empty" }))
    .min(1, { error: "Span path must contain at least one element" }),
});

export const registerEvaluatorToSpanPath = async (input: z.infer<typeof RegisterEvaluatorToSpanPathSchema>) => {
  const { projectId, evaluatorId, spanPath } = RegisterEvaluatorToSpanPathSchema.parse(input);

  const [evaluatorSpanPath] = await db
    .insert(evaluatorSpanPaths)
    .values({
      evaluatorId,
      projectId,
      spanPath,
    })
    .returning();

  if (!evaluatorSpanPath) {
    throw new Error("Failed to register evaluator to span path");
  }

  return evaluatorSpanPath;
};

export const unregisterEvaluatorFromSpanPath = async (input: z.infer<typeof UnregisterEvaluatorFromSpanPathSchema>) => {
  const { projectId, evaluatorId, spanPath } = UnregisterEvaluatorFromSpanPathSchema.parse(input);

  const pathLength = spanPath.length;

  const conditions = [
    eq(evaluatorSpanPaths.evaluatorId, evaluatorId),
    eq(evaluatorSpanPaths.projectId, projectId),
    sql`jsonb_array_length(${evaluatorSpanPaths.spanPath}) = ${pathLength}`,
    sql`${evaluatorSpanPaths.spanPath} = ${JSON.stringify(spanPath)}`,
  ];

  await db.delete(evaluatorSpanPaths).where(and(...conditions));

  return { message: "Evaluator detached from span path successfully" };
};
