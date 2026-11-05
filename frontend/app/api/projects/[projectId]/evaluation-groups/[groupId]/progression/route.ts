import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";
import { getEvaluationTimeProgression } from "@/lib/clickhouse/evaluation-scores";
import { type AggregationFunction } from "@/lib/clickhouse/types";

export const POST = noAudit(
  "read-only progression query sent as POST",
  apiHandler<{ projectId: string; groupId: string }>(async (req, ctx) => {
    const { projectId, groupId } = await ctx.params;

    const body = (await req.json()) as { ids?: string[]; aggregate?: string };
    const ids = body.ids ?? [];
    const aggregationFunction = (body.aggregate ?? "AVG") as AggregationFunction;

    return Response.json(await getEvaluationTimeProgression(projectId, groupId, aggregationFunction, ids));
  })
);
