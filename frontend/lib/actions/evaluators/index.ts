import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluators } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";

export interface Evaluator {
  id: string;
  projectId: string;
  name: string;
  evaluatorType: string;
  definition: Record<string, unknown>;
  createdAt: string;
}

export interface EvaluatorScore {
  id: string;
  evaluatorId: string;
  spanId: string;
  score: number;
  createdAt: string;
}

export const GetEvaluatorsSchema = z.object({
  projectId: z.string(),
  pageSize: z
    .string()
    .nullable()
    .default("25")
    .transform((val) => Number(val) || 25),
  pageNumber: z
    .string()
    .nullable()
    .default("0")
    .transform((val) => Number(val) || 0),
});

export const CreateEvaluatorSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, { error: "Name is required" }).max(255, { error: "Name must be less than 255 characters" }),
  evaluatorType: z.string().min(1, { error: "Evaluator type is required" }),
  definition: z.record(z.string(), z.unknown()).optional().default({}),
});

export const DeleteEvaluatorsSchema = z.object({
  projectId: z.string(),
  evaluatorIds: z.array(z.string()).min(1, { error: "At least one evaluator ID is required" }),
});

export const getEvaluators = async (input: z.infer<typeof GetEvaluatorsSchema>) => {
  const { projectId, pageSize, pageNumber } = input;

  const result = await paginatedGet<any, Evaluator>({
    table: evaluators,
    filters: [eq(evaluators.projectId, projectId)],
    pageSize,
    pageNumber,
    orderBy: [desc(evaluators.createdAt)],
  });

  return result;
};

export const createEvaluator = async (input: z.infer<typeof CreateEvaluatorSchema>) => {
  const { projectId, name, evaluatorType, definition } = CreateEvaluatorSchema.parse(input);

  const [newEvaluator] = await db
    .insert(evaluators)
    .values({
      projectId,
      name,
      evaluatorType,
      definition,
    })
    .returning();

  if (!newEvaluator) {
    throw new Error("Failed to create evaluator");
  }

  return newEvaluator;
};

export const deleteEvaluators = async (input: z.infer<typeof DeleteEvaluatorsSchema>) => {
  const { projectId, evaluatorIds } = DeleteEvaluatorsSchema.parse(input);

  await db.delete(evaluators).where(and(inArray(evaluators.id, evaluatorIds), eq(evaluators.projectId, projectId)));
};
