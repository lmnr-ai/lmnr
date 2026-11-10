import { workspaceHasAuditLog } from "@/lib/actions/usage/plan-gates";
import { getWorkspaceRole } from "@/lib/authorization";
import { permissionsForRole } from "@/lib/authorization/permissions";

export type AuditLogAccess = "allowed" | "role_denied" | "plan_required";

/** Owners and admins, on a plan that includes the audit log (always on self-hosted). */
export const getAuditLogAccess = async (workspaceId: string, userId: string): Promise<AuditLogAccess> => {
  const role = await getWorkspaceRole(workspaceId, userId);
  if (!permissionsForRole(role).viewAuditLog) return "role_denied";
  if (!(await workspaceHasAuditLog(workspaceId))) return "plan_required";
  return "allowed";
};

/** The error response for a request `getAuditLogAccess` refused. */
export const auditLogAccessError = (access: Exclude<AuditLogAccess, "allowed">): Response =>
  access === "role_denied"
    ? Response.json({ error: "Only workspace owners and admins can view the audit log" }, { status: 403 })
    : Response.json({ error: "The audit log is available on the Scale plan", code: "PLAN_REQUIRED" }, { status: 403 });

/** The list/export query parameters shared by both audit-events routes. */
export const auditQueryFromSearchParams = (params: URLSearchParams) => ({
  filters: params.getAll("filter").map((f) => JSON.parse(f)),
  projectId: params.get("projectId") ?? undefined,
  pastHours: params.get("pastHours") ?? undefined,
  startDate: params.get("startDate") ?? undefined,
  endDate: params.get("endDate") ?? undefined,
});
