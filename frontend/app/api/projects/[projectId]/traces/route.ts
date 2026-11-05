import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteTraces, DeleteTracesSchema, getTraces, GetTracesSchema } from "@/lib/actions/traces";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";
import { withAudit } from "@/lib/audit";

export const GET = withAudit<{ projectId: string }>(
  { resource: "trace", action: "list", read: true },
  async (req, ctx, audit) => {
    const params = await ctx.params;
    const projectId = params.projectId;
    // One event per table load; later pages of the same scroll add nothing.
    if (Number(req.nextUrl.searchParams.get("pageNumber") ?? 0) > 0) {
      audit.skip();
    }
    audit.set({ metadata: { view: "traces" } });

    const parseResult = parseUrlParams(req.nextUrl.searchParams, GetTracesSchema.omit({ projectId: true }));

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

    const result = await getTraces({ ...parseResult.data, projectId });
    return Response.json(result);
  }
);

export const DELETE = withAudit<{ projectId: string }>(
  { resource: "trace", action: "delete" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const traceIds = req.nextUrl.searchParams.getAll("traceId");

    const parseResult = DeleteTracesSchema.safeParse({ projectId, traceIds });

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    await audit.target(parseResult.data.traceIds);
    await deleteTraces(parseResult.data);
    return new Response("Traces deleted successfully.", { status: 200 });
  }
);
