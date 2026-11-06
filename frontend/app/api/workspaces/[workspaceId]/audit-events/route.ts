import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getAuditEvents } from "@/lib/actions/audit-log";
import { auditLogAccessError, auditQueryFromSearchParams, getAuditLogAccess } from "@/lib/actions/audit-log/access";
import { handlerWithAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";
import { cache } from "@/lib/cache";

// Reading the log is itself audited, but only the first view per user per hour:
// paging and filter changes would otherwise flood the log with its own reads.
const VIEW_LOGGED_TTL_SECONDS = 60 * 60;

export const GET = handlerWithAudit(
  { resource: "audit_log", action: "view", read: true },
  async (req: NextRequest, props: { params: Promise<{ workspaceId: string }> }, audit): Promise<Response> => {
    const { workspaceId } = await props.params;
    const session = await getServerSession();
    if (!session?.user) {
      audit.skip();
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // A role denial is logged as `denied`; a plan-gated request is not an access attempt worth recording.
    const access = await getAuditLogAccess(workspaceId, session.user.id);
    if (access !== "allowed") {
      if (access === "plan_required") audit.skip();
      return auditLogAccessError(access);
    }

    try {
      const params = req.nextUrl.searchParams;
      const result = await getAuditEvents({
        ...auditQueryFromSearchParams(params),
        workspaceId,
        pageNumber: params.get("pageNumber") ?? undefined,
        pageSize: params.get("pageSize") ?? undefined,
      });

      const viewedKey = `audit_log_viewed:${workspaceId}:${session.user.id}`;
      if (await cache.exists(viewedKey).catch(() => false)) {
        audit.skip();
      } else {
        await cache.set(viewedKey, true, { expireAfterSeconds: VIEW_LOGGED_TTL_SECONDS }).catch(() => {});
      }

      return Response.json(result);
    } catch (error) {
      audit.skip();
      if (error instanceof ZodError) {
        return Response.json({ error: prettifyError(error) }, { status: 400 });
      }
      if (error instanceof SyntaxError) {
        return Response.json({ error: "Invalid filter" }, { status: 400 });
      }
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to load the audit log" },
        { status: 500 }
      );
    }
  }
);
