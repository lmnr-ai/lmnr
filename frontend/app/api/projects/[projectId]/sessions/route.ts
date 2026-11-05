import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSessions, getSessions, GetSessionsSchema } from "@/lib/actions/sessions";
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
    audit.set({ metadata: { view: "sessions" } });

    const parseResult = parseUrlParams(req.nextUrl.searchParams, GetSessionsSchema.omit({ projectId: true }));

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const retentionError = await checkDataRetentionAccess(projectId, {
      pastHours: parseResult.data.pastHours,
      startDate: parseResult.data.startDate,
    });
    if (retentionError) {
      return retentionError;
    }

    const result = await getSessions({ ...parseResult.data, projectId });
    return Response.json(result);
  }
);

export const DELETE = withAudit<{ projectId: string }>(
  { resource: "trace", action: "delete" },
  async (req, ctx, audit) => {
    const params = await ctx.params;
    const projectId = params.projectId;

    const sessionIds = req.nextUrl.searchParams.getAll("id");

    await audit.target(sessionIds);
    await deleteSessions({ projectId, sessionIds });
    return Response.json({ success: true });
  }
);
