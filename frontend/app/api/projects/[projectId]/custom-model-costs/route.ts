import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteCustomModelCost, getCustomModelCosts, upsertCustomModelCost } from "@/lib/actions/custom-model-costs";
import { invalidateCustomModelCostsCache } from "@/lib/actions/custom-model-costs/invalidate-cache";

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

    const { result, deletedModel, deletedProvider } = await upsertCustomModelCost({
      projectId: params.projectId,
      provider: body.provider,
      model: body.model,
      costs: body.costs,
      previousModel: body.previousModel,
      previousProvider: body.previousProvider,
    });

    // Invalidate cache for the old provider+model if it was renamed
    if (deletedModel) {
      await invalidateCustomModelCostsCache(params.projectId, deletedProvider ?? null, deletedModel);
    }
    // Use result values (lowercased by upsertCustomModelCost) rather than raw body values
    await invalidateCustomModelCostsCache(params.projectId, result.provider, result.model);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error upserting custom model cost:", error);
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

    const deleted = await deleteCustomModelCost({
      projectId: params.projectId,
      id,
    });

    await invalidateCustomModelCostsCache(params.projectId, deleted.provider, deleted.model);

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error deleting custom model cost:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 404 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
