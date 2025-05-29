import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { evaluators } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";
import { Evaluator } from "@/lib/evaluators/types";

const getEvaluatorsSchema = z.object({
  pageSize: z.coerce.number().min(1).max(100).default(25),
  pageNumber: z.coerce.number().min(0).default(0),
});

const createEvaluatorSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name must be less than 255 characters"),
  evaluatorType: z.string().min(1, "Evaluator type is required"),
  definition: z.record(z.unknown()).optional().default({}),
});

const deleteEvaluatorsSchema = z.object({
  id: z.array(z.string().uuid("Invalid evaluator ID format")).min(1, "At least one evaluator ID is required"),
});

const paramsSchema = z.object({
  projectId: z.string().uuid("Invalid project ID format"),
});

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;

    const { projectId } = paramsSchema.parse(params);

    const queryParams = getEvaluatorsSchema.parse({
      pageSize: req.nextUrl.searchParams.get("pageSize"),
      pageNumber: req.nextUrl.searchParams.get("pageNumber"),
    });

    const result = await paginatedGet<any, Evaluator>({
      table: evaluators,
      filters: [eq(evaluators.projectId, projectId)],
      pageSize: queryParams.pageSize,
      pageNumber: queryParams.pageNumber,
      orderBy: [desc(evaluators.createdAt)],
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;

    // Validate route parameters
    const { projectId } = paramsSchema.parse(params);

    // Validate request body
    const body = await req.json();
    const validatedData = createEvaluatorSchema.parse(body);

    const [newEvaluator] = await db
      .insert(evaluators)
      .values({
        projectId,
        name: validatedData.name,
        evaluatorType: validatedData.evaluatorType,
        definition: validatedData.definition,
      })
      .returning();

    return Response.json(newEvaluator);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;

    const { projectId } = paramsSchema.parse(params);

    const { searchParams } = new URL(req.url);
    const evaluatorIds = searchParams.getAll("id");

    const { id: validatedIds } = deleteEvaluatorsSchema.parse({ id: evaluatorIds });

    await db.delete(evaluators).where(and(inArray(evaluators.id, validatedIds), eq(evaluators.projectId, projectId)));

    return Response.json({ message: "Evaluators deleted successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
