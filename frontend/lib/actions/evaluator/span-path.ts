import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { PROJECT_EVALUATORS_BY_PATH_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { evaluatorSpanPaths } from "@/lib/db/migrations/schema";

import { appendEvaluatorIdToCache, removeEvaluatorIdFromCache } from "./cache";

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

export const GetSpanPathSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string(),
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

  await appendEvaluatorIdToCache(projectId, spanPath, evaluatorId);

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

  await removeEvaluatorIdFromCache(projectId, spanPath, evaluatorId);

  return { message: "Evaluator detached from span path successfully" };
};

export const getSpanPath = async (input: z.infer<typeof GetSpanPathSchema>): Promise<string[] | null> => {
  const { projectId, evaluatorId } = GetSpanPathSchema.parse(input);

  const evaluatorSpanPath = await db.query.evaluatorSpanPaths.findFirst({
    where: and(eq(evaluatorSpanPaths.projectId, projectId), eq(evaluatorSpanPaths.evaluatorId, evaluatorId)),
    columns: {
      spanPath: true,
    },
  });

  if (!evaluatorSpanPath) {
    return null;
  }

  return evaluatorSpanPath.spanPath as string[];
};


export const spanPathCacheKey = (projectId: string, spanPath: string[]): string => `${PROJECT_EVALUATORS_BY_PATH_CACHE_KEY}:${projectId}:${JSON.stringify(spanPath)}`;
