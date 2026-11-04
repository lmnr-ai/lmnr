import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { getServerSession } from "@/lib/auth-session";
import { notTrialLocked } from "@/lib/authorization/trial-lock";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";
import { AuthorizationError } from "@/lib/errors";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { SSO_MANAGED_MEMBERSHIP_MESSAGE, WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/workspaces/types";

// SCIM reconciles memberships from Okta groups; a manual change would silently diverge.
export const assertMembershipNotSsoManaged = (message = SSO_MANAGED_MEMBERSHIP_MESSAGE) => {
  if (isFeatureEnabled(Feature.SSO_MANAGED_MEMBERSHIP)) {
    throw new AuthorizationError(message, 403);
  }
};
const CheckWorkspaceRoleSchema = z.object({
  workspaceId: z.guid(),
  roles: z.array(z.enum(WORKSPACE_ROLES)).min(1),
});

export const checkUserWorkspaceRole = async (input: z.infer<typeof CheckWorkspaceRoleSchema>) => {
  const { workspaceId, roles } = CheckWorkspaceRoleSchema.parse(input);

  const session = await getServerSession();
  if (!session?.user) {
    throw new AuthorizationError("Unauthorized: User not authenticated", 401);
  }

  const membership = await db.query.membersOfWorkspaces.findFirst({
    where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, session.user.id)),
  });

  if (!membership) {
    throw new AuthorizationError("User is not a member of this workspace", 403);
  }

  const userRole = membership.memberRole as WorkspaceRole;

  if (!roles.includes(userRole)) {
    const roleList = roles.join(" or ");
    throw new AuthorizationError(`Forbidden: Only ${roleList} roles can perform this action`, 403);
  }

  return userRole;
};

export const countWorkspaceMemberships = async (userId: string): Promise<number> => {
  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.userId, userId), notTrialLocked));
  return count;
};
