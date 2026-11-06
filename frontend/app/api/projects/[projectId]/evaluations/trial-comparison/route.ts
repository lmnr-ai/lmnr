import { getEvaluationTrialComparison, GetEvaluationTrialComparisonSchema } from "@/lib/actions/evaluation";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

// POST (not GET): the run-id list is unbounded (a group can have hundreds of
// runs), so it rides the body rather than a query string that would blow the
// URL-length limit and force a client-side cap.
export const POST = handlerNoAudit(
  "read-only comparison query sent as POST",
  apiHandler<{ projectId: string }>(async (req, ctx) => {
    const { projectId } = await ctx.params;

    const body = (await req.json().catch(() => null)) as { evaluationIds?: unknown; taskId?: unknown } | null;

    const input = GetEvaluationTrialComparisonSchema.parse({
      projectId,
      evaluationIds: body?.evaluationIds,
      taskId: body?.taskId,
    });

    return Response.json({ rows: await getEvaluationTrialComparison(input) });
  })
);
