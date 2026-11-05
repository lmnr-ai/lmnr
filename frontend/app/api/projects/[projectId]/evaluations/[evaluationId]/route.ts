import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  getEvaluationTrials,
  GetEvaluationTrialsSchema,
  renameEvaluation,
  RenameEvaluationSchema,
} from "@/lib/actions/evaluation";
import { updateEvaluationVisibility } from "@/lib/actions/evaluation/visibility";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;

  // Parse URL params using the schema
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetEvaluationTrialsSchema.omit({ evaluationId: true, projectId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  // Call the action to get evaluation trials with all transformations
  const result = await getEvaluationTrials({
    ...parseResult.data,
    projectId,
    evaluationId,
  });

  return Response.json(result);
});

export const PATCH = withAudit<{ projectId: string; evaluationId: string }>(
  { resource: "evaluation", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, evaluationId } = await ctx.params;

    const body = await req.json();
    const parseResult = RenameEvaluationSchema.safeParse({
      ...body,
      projectId,
      evaluationId,
    });

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const updated = await renameEvaluation(parseResult.data);
    await audit.target(evaluationId);
    return Response.json(updated);
  }
);

export const PUT = withAudit<{ projectId: string; evaluationId: string }>(
  { resource: "evaluation", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, evaluationId } = await ctx.params;

    const body = await req.json();
    const visibility = body.visibility;

    if (visibility !== "public" && visibility !== "private") {
      return Response.json({ error: "visibility must be 'public' or 'private'" }, { status: 400 });
    }

    await updateEvaluationVisibility({ evaluationId, projectId, visibility });
    audit.set({ metadata: { visibility } });
    await audit.target(evaluationId);
    return Response.json({ visibility });
  }
);
