import { and, eq, inArray, sql } from "drizzle-orm";

import { type AuthTransaction } from "@/lib/auth-db";
import { invalidateMemberAccessCache } from "@/lib/authorization/member-cache";
import { cache, MEMBER_ROLE_CACHE_KEY } from "@/lib/cache";
import { membersOfWorkspaces, workspaces } from "@/lib/db/migrations/schema";
import { insertProject, insertWorkspace } from "@/lib/workspaces/insert";

import { SSO_DEFAULT_PROJECT_NAME } from "./constants";
import {
  missingWorkspaceNames,
  normalizeWorkspaceName,
  planMembershipSync,
  resolveGrants,
  type SyncPlan,
  type WorkspaceGrant,
} from "./plan";

// Serializes find-or-create per name across concurrent reconciles (names are not unique,
// so a duplicate would make the name ambiguous forever). Sorted to avoid lock-order deadlocks.
const lockWorkspaceNames = async (tx: AuthTransaction, names: string[]) => {
  for (const name of [...names].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`laminar-sso-workspace:${name}`}))`);
  }
};

const findOrCreateWorkspaces = async (tx: AuthTransaction, grants: WorkspaceGrant[]) => {
  const names = [...new Set(grants.map((g) => normalizeWorkspaceName(g.workspaceName)))];
  if (names.length === 0) return [];

  await lockWorkspaceNames(tx, names);
  const found = await tx
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(inArray(sql`lower(trim(${workspaces.name}))`, names));

  for (const name of missingWorkspaceNames(grants, found)) {
    const workspace = await insertWorkspace(tx, name);
    // Without a project, users land on the bare /projects page and can't create one either.
    await insertProject(tx, { name: SSO_DEFAULT_PROJECT_NAME, workspaceId: workspace.id });
    found.push(workspace);
  }
  return found;
};

const applyPlan = async (tx: AuthTransaction, userId: string, plan: SyncPlan) => {
  const rowOf = (workspaceId: string) =>
    and(eq(membersOfWorkspaces.userId, userId), eq(membersOfWorkspaces.workspaceId, workspaceId));

  if (plan.insert.length > 0) {
    await tx
      .insert(membersOfWorkspaces)
      .values(plan.insert.map(({ workspaceId, role }) => ({ userId, workspaceId, memberRole: role })))
      .onConflictDoNothing();
  }
  for (const { workspaceId, role } of plan.updateRole) {
    await tx.update(membersOfWorkspaces).set({ memberRole: role }).where(rowOf(workspaceId));
  }
  for (const workspaceId of plan.remove) {
    await tx.delete(membersOfWorkspaces).where(rowOf(workspaceId));
  }
};

/**
 * Makes the user's workspace memberships match their grants, creating workspaces that
 * don't exist yet. Returns the workspaces whose membership changed.
 */
export const reconcileWorkspaceMemberships = async (
  tx: AuthTransaction,
  userId: string,
  grants: WorkspaceGrant[]
): Promise<string[]> => {
  const { desired, ambiguous } = resolveGrants(grants, await findOrCreateWorkspaces(tx, grants));
  if (ambiguous.length > 0) {
    console.warn(`SCIM: workspace names match more than one workspace, not granted: ${ambiguous.join(", ")}`);
  }

  const current = await tx
    .select({ workspaceId: membersOfWorkspaces.workspaceId, memberRole: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, userId));

  const plan = planMembershipSync(current, desired);
  await applyPlan(tx, userId, plan);

  return [...plan.insert.map((g) => g.workspaceId), ...plan.updateRole.map((g) => g.workspaceId), ...plan.remove];
};

export const invalidateMembershipCaches = async (userId: string, workspaceIds: string[]) => {
  await Promise.all(
    workspaceIds.map(async (workspaceId) => {
      await cache.remove(MEMBER_ROLE_CACHE_KEY(workspaceId, userId)).catch((e) => {
        console.error("Error clearing member role cache after SCIM reconcile", e);
      });
      await invalidateMemberAccessCache(workspaceId, [userId]);
    })
  );
};
