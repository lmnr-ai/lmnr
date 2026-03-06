import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { copyCustomModelCosts, getCustomModelCosts } from "@/lib/actions/custom-model-costs";
import { invalidateCustomModelCostsCache } from "@/lib/actions/custom-model-costs/invalidate-cache";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();
    const targetProjectId = body.targetProjectId;

    if (!targetProjectId) {
      return new Response("targetProjectId is required", { status: 400 });
    }

    // Fetch existing target costs before copy so we can invalidate their cache entries
    const existingTargetCosts = await getCustomModelCosts({ projectId: targetProjectId });

    const result = await copyCustomModelCosts({
      sourceProjectId: params.projectId,
      targetProjectId,
    });

    // Invalidate cache for previously existing models in target (now deleted/replaced)
    const invalidations = existingTargetCosts.map((cost) =>
      invalidateCustomModelCostsCache(targetProjectId, cost.model, cost.provider ?? undefined)
    );
    // Also invalidate cache for newly copied models in target
    for (const cost of result) {
      invalidations.push(invalidateCustomModelCostsCache(targetProjectId, cost.model, cost.provider ?? undefined));
    }
    await Promise.all(invalidations);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error copying custom model costs:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
