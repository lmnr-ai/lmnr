import { getGroupEvaluationsInfo } from "@/lib/actions/evaluations";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";
import { getEvaluationTimeProgression } from "@/lib/clickhouse/evaluation-scores";
import { type AggregationFunction } from "@/lib/clickhouse/types";

export const POST = handlerNoAudit(
  "read-only progression query sent as POST",
  apiHandler<{ projectId: string; groupId: string }>(async (req, ctx) => {
    const { projectId, groupId } = await ctx.params;

    const body = (await req.json()) as { ids?: string[]; aggregate?: string };
    const ids = body.ids ?? [];
    const aggregationFunction = (body.aggregate ?? "AVG") as AggregationFunction;

    const [progression, infos] = await Promise.all([
      getEvaluationTimeProgression(projectId, groupId, aggregationFunction, ids),
      getGroupEvaluationsInfo(projectId, groupId),
    ]);
    const infoById = new Map(infos.map((info) => [info.id, info]));

    return Response.json(
      progression.map((point) => {
        const info = infoById.get(point.evaluationId);
        return { ...point, name: info?.name, metadata: info?.metadata };
      })
    );
  })
);
