import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { AUDIT_EXPORT_MAX_ROWS, exportAuditEventsCsv } from "@/lib/actions/audit-log";
import { auditLogAccessError, auditQueryFromSearchParams, getAuditLogAccess } from "@/lib/actions/audit-log/access";
import { withAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

// Every export is logged (unlike page views): it takes the log out of the product.
export const GET = withAudit(
  { resource: "audit_log", action: "export", read: true },
  async (req: NextRequest, props: { params: Promise<{ workspaceId: string }> }, audit): Promise<Response> => {
    const { workspaceId } = await props.params;
    const session = await getServerSession();
    if (!session?.user) {
      audit.skip();
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getAuditLogAccess(workspaceId, session.user.id);
    if (access !== "allowed") {
      if (access === "plan_required") audit.skip();
      return auditLogAccessError(access);
    }

    try {
      const query = auditQueryFromSearchParams(req.nextUrl.searchParams);
      audit.set({
        metadata: {
          filters: query.filters,
          pastHours: query.pastHours,
          startDate: query.startDate,
          endDate: query.endDate,
        },
      });
      const csv = await exportAuditEventsCsv({ ...query, workspaceId });
      const date = new Date().toISOString().slice(0, 10);
      // Next doesn't compress route handler responses; the CSV shrinks ~8x.
      const gzip = req.headers.get("accept-encoding")?.includes("gzip") ?? false;
      return new Response(gzip ? csv.pipeThrough(new CompressionStream("gzip")) : csv, {
        headers: {
          ...(gzip && { "Content-Encoding": "gzip" }),
          Vary: "Accept-Encoding",
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-log-${date}.csv"`,
          "X-Max-Rows": String(AUDIT_EXPORT_MAX_ROWS),
        },
      });
    } catch (error) {
      audit.skip();
      if (error instanceof ZodError) {
        return Response.json({ error: prettifyError(error) }, { status: 400 });
      }
      if (error instanceof SyntaxError) {
        return Response.json({ error: "Invalid filter" }, { status: 400 });
      }
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to export the audit log" },
        { status: 500 }
      );
    }
  }
);
