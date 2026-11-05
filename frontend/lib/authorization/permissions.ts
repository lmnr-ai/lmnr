import { type WorkspaceRole } from "@/lib/workspaces/types";

/**
 * What a workspace role may do. Decisions about data or features read these,
 * never the role name, so custom roles can later feed the same struct. The
 * data-read twin in app-server is `access_policy::permissions_for_role`.
 */
export interface RolePermissions {
  viewPii: boolean;
  viewAuditLog: boolean;
}

const PRIVILEGED: RolePermissions = { viewPii: true, viewAuditLog: true };
const MEMBER: RolePermissions = { viewPii: false, viewAuditLog: false };

// Unknown roles get member permissions (fail-closed), matching app-server.
export const permissionsForRole = (role: WorkspaceRole | string | null | undefined): RolePermissions =>
  role === "owner" || role === "admin" ? PRIVILEGED : MEMBER;
