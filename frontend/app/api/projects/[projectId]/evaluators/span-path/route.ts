import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { evaluators, evaluatorSpanPaths } from "@/lib/db/migrations/schema";

const querySchema = z.object({
  spanPath: z.string().min(1, "Span path is required"),
});

const spanPathArraySchema = z
  .array(z.string().min(1, "Span path elements cannot be empty"))
  .min(1, "Span path must contain at least one element");

const parseSpanPath = (
  spanPathString: string
): { success: true; data: string[] } | { success: false; error: string } => {
  try {
    const parsed = JSON.parse(spanPathString);
    const result = spanPathArraySchema.safeParse(parsed);

    if (!result.success) {
      return {
        success: false,
        error: `Invalid span path format: ${result.error.errors.map((e) => e.message).join(", ")}`,
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: "Invalid JSON format. Expected JSON array of strings.",
    };
  }
};

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId } = params;

    const spanPathParam = req.nextUrl.searchParams.get("spanPath");

    const { spanPath: spanPathString } = querySchema.parse({ spanPath: spanPathParam });

    const spanPathResult = parseSpanPath(spanPathString);
    if (!spanPathResult.success) {
      return Response.json({ error: spanPathResult.error }, { status: 400 });
    }

    const spanPath = spanPathResult.data;

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

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
