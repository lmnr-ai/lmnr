import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { evaluatorSpanPaths } from "@/lib/db/migrations/schema";

const requestBodySchema = z.object({
  spanPath: z
    .array(z.string().min(1, "Span path elements cannot be empty"))
    .min(1, "Span path must contain at least one element"),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluatorId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const evaluatorId = params.evaluatorId;
    const projectId = params.projectId;

    const body = await req.json();
    const { spanPath } = requestBodySchema.parse(body);

    const [evaluatorSpanPath] = await db
      .insert(evaluatorSpanPaths)
      .values({
        evaluatorId,
        projectId,
        spanPath,
      })
      .returning();

    return Response.json(evaluatorSpanPath);
  } catch (error) {
    console.error("Error registering evaluator to span path:", error);

    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluatorId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const evaluatorId = params.evaluatorId;
    const projectId = params.projectId;

    const body = await req.json();
    const { spanPath } = requestBodySchema.parse(body);

    const pathLength = spanPath.length;

    const conditions = [
      eq(evaluatorSpanPaths.evaluatorId, evaluatorId),
      eq(evaluatorSpanPaths.projectId, projectId),
      sql`jsonb_array_length(${evaluatorSpanPaths.spanPath}) = ${pathLength}`,
      sql`${evaluatorSpanPaths.spanPath} = ${JSON.stringify(spanPath)}`,
    ];

    await db.delete(evaluatorSpanPaths).where(and(...conditions));

    return Response.json("Evaluator detached from span path successfully");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
