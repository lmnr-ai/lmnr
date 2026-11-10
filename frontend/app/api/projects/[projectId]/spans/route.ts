import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSpans, getSpans, GetSpansSchema } from "@/lib/actions/spans";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetSpansSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ items: [] });
  }

  const retentionError = await checkDataRetentionAccess(projectId, {
    pastHours: parseResult.data.pastHours,
    startDate: parseResult.data.startDate,
  });
  if (retentionError) {
    return retentionError;
  }

  return Response.json(await getSpans({ ...parseResult.data, projectId }));
});

export const DELETE = handlerWithAudit<{ projectId: string }>(
  { resource: "trace", action: "delete" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const spanIds = req.nextUrl.searchParams.getAll("id");
    await audit.target(spanIds);
    await deleteSpans({ spanIds, projectId });
    return new Response("Spans deleted successfully", { status: 200 });
  }
);
