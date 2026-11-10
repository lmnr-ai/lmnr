import { type WorkspaceRole } from "@/lib/workspaces/types";

// Okta group names grant workspace access by convention:
//   laminar:<env>:<workspace_name>:<role>
//   laminar:<env>:<workspace_name>:<project_name>:<role>
// Names may contain spaces but never ":", which is what the segment count relies on.
// <env> is not checked here: each deployment's Okta app pushes only its own env's groups.
// Groups never grant owner: SSO-managed workspaces have no owner.

const GROUP_ROLES = ["member", "admin"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export type LaminarGroup = {
  workspaceName: string;
  projectName?: string;
  role: GroupRole;
};

export type WorkspaceGrant = { workspaceName: string; role: GroupRole };

const ROLE_RANK: Record<GroupRole, number> = { member: 0, admin: 1 };

export const normalizeWorkspaceName = (name: string) => name.trim().toLowerCase();

const parseRole = (segment: string): GroupRole | null => {
  const role = segment.toLowerCase();
  return GROUP_ROLES.find((r) => r === role) ?? null;
};

export const parseLaminarGroup = (group: string): LaminarGroup | null => {
  const parts = group.split(":").map((part) => part.trim());
  if (parts.length !== 4 && parts.length !== 5) return null;
  if (parts.some((part) => part === "")) return null;
  if (parts[0].toLowerCase() !== "laminar") return null;

  const role = parseRole(parts[parts.length - 1]);
  if (!role) return null;

  return parts.length === 4
    ? { workspaceName: parts[2], role }
    : { workspaceName: parts[2], projectName: parts[3], role };
};

// SCIM role slugs are opaque strings. Role first, so the workspace name is everything after
// the first ":".
export const encodeGrant = ({ workspaceName, role }: WorkspaceGrant) => `${role}:${workspaceName}`;

export const decodeGrant = (slug: string): WorkspaceGrant | null => {
  const separator = slug.indexOf(":");
  if (separator < 0) return null;
  const role = parseRole(slug.slice(0, separator));
  const workspaceName = slug.slice(separator + 1).trim();
  if (!role || workspaceName === "") return null;
  return { workspaceName, role };
};

/** Workspace names from the grants that match no existing workspace, deduplicated by normalized name. */
export const missingWorkspaceNames = (grants: WorkspaceGrant[], workspaces: { name: string }[]): string[] => {
  const existing = new Set(workspaces.map((w) => normalizeWorkspaceName(w.name)));
  const missing = new Map<string, string>();
  for (const { workspaceName } of grants) {
    const key = normalizeWorkspaceName(workspaceName);
    if (!existing.has(key) && !missing.has(key)) missing.set(key, workspaceName.trim());
  }
  return [...missing.values()];
};

export type ResolvedGrants = {
  desired: Map<string, GroupRole>;
  /** Workspace names matching more than one workspace; granted nowhere. */
  ambiguous: string[];
};

export const resolveGrants = (grants: WorkspaceGrant[], workspaces: { id: string; name: string }[]): ResolvedGrants => {
  const workspacesByName = new Map<string, string[]>();
  for (const { id, name } of workspaces) {
    const key = normalizeWorkspaceName(name);
    workspacesByName.set(key, [...(workspacesByName.get(key) ?? []), id]);
  }

  const desired = new Map<string, GroupRole>();
  const ambiguous = new Set<string>();

  for (const grant of grants) {
    const ids = workspacesByName.get(normalizeWorkspaceName(grant.workspaceName)) ?? [];
    if (ids.length > 1) {
      ambiguous.add(grant.workspaceName);
      continue;
    }
    if (ids.length === 0) continue;
    const current = desired.get(ids[0]);
    if (!current || ROLE_RANK[grant.role] > ROLE_RANK[current]) desired.set(ids[0], grant.role);
  }

  return { desired, ambiguous: [...ambiguous] };
};

export type MembershipRow = { workspaceId: string; memberRole: WorkspaceRole };

export type SyncPlan = {
  insert: { workspaceId: string; role: GroupRole }[];
  updateRole: { workspaceId: string; role: GroupRole }[];
  remove: string[];
};

/** Groups are authoritative for every membership, including pre-SSO rows and owners. */
export const planMembershipSync = (current: MembershipRow[], desired: Map<string, GroupRole>): SyncPlan => {
  const plan: SyncPlan = { insert: [], updateRole: [], remove: [] };
  const currentByWorkspace = new Map(current.map((row) => [row.workspaceId, row]));

  for (const [workspaceId, role] of desired) {
    const row = currentByWorkspace.get(workspaceId);
    if (!row) {
      plan.insert.push({ workspaceId, role });
    } else if (row.memberRole !== role) {
      plan.updateRole.push({ workspaceId, role });
    }
  }

  for (const row of current) {
    if (!desired.has(row.workspaceId)) {
      plan.remove.push(row.workspaceId);
    }
  }

  return plan;
};
