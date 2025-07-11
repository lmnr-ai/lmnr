import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluators, evaluatorSpanPaths } from "@/lib/db/migrations/schema";

export const GetEvaluatorsBySpanPathSchema = z.object({
  projectId: z.string(),
  spanPath: z
    .array(z.string().min(1, { error: "Span path elements cannot be empty" }))
    .min(1, { error: "Span path must contain at least one element" }),
});

export const getEvaluatorsBySpanPath = async (input: z.infer<typeof GetEvaluatorsBySpanPathSchema>) => {
  const { projectId, spanPath } = GetEvaluatorsBySpanPathSchema.parse(input);

  const pathLength = spanPath.length;

  const conditions = [
    eq(evaluators.projectId, projectId),
    sql`jsonb_array_length(${evaluatorSpanPaths.spanPath}) = ${pathLength}`,
    sql`${evaluatorSpanPaths.spanPath} = ${JSON.stringify(spanPath)}`,
  ];

  const result = await db
    .select({
      id: evaluators.id,
      name: evaluators.name,
      evaluatorType: evaluators.evaluatorType,
    })
    .from(evaluators)
    .innerJoin(evaluatorSpanPaths, eq(evaluators.id, evaluatorSpanPaths.evaluatorId))
    .where(and(...conditions));

  return result;
};
