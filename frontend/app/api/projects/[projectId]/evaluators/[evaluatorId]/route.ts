import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { evaluators } from "@/lib/db/migrations/schema";

const updateEvaluatorSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name must be less than 255 characters"),
  definition: z.object({
    function_code: z.string().min(1, "Function code is required"),
  }),
});

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluatorId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;

    const { projectId, evaluatorId } = params;

    const body = await req.json();
    const { name, definition } = updateEvaluatorSchema.parse(body);

    const [updatedEvaluator] = await db
      .update(evaluators)
      .set({
        name,
        definition,
      })
      .where(and(eq(evaluators.id, evaluatorId), eq(evaluators.projectId, projectId)))
      .returning();

    if (!updatedEvaluator) {
      return Response.json({ error: "Failed to update evaluator" }, { status: 500 });
    }

    return Response.json(updatedEvaluator);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: e.errors }, { status: 400 });
    }

    return Response.json({ error: e instanceof Error ? e.message : "Internal server error" }, { status: 500 });
  }
}
