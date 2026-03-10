import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import {
  deleteCustomModelCost,
  DuplicateModelCostError,
  getCustomModelCosts,
  upsertCustomModelCost,
} from "@/lib/actions/custom-model-costs";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const costs = await getCustomModelCosts({
      projectId: params.projectId,
    });

    return new Response(JSON.stringify(costs), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching custom model costs:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    const { result } = await upsertCustomModelCost({
      id: body.id,
      projectId: params.projectId,
      provider: body.provider,
      model: body.model,
      costs: body.costs,
      previousModel: body.previousModel,
      previousProvider: body.previousProvider,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error upserting custom model cost:", error);
    if (error instanceof DuplicateModelCostError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";

    await deleteCustomModelCost({
      projectId: params.projectId,
      id,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error deleting custom model cost:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      const status = error.message === "Custom model cost not found" ? 404 : 500;
      return new Response(error.message, { status });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
