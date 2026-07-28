import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";
import { type WorkspaceRole } from "@/lib/workspaces/types";

const CheckWorkspaceRoleSchema = z.object({
  workspaceId: z.guid(),
  roles: z.array(z.enum(["member", "admin", "owner"])).min(1),
});

/// Thrown only for genuine authorization outcomes (not signed in, not a member,
/// wrong role) so a caller can map those to 401/403 without also swallowing
/// input-validation (ZodError) or database failures, which must stay 4xx/5xx on
/// their own merits. Subclasses Error with the same messages as before, so
/// existing catch-all callers are unaffected.
export class WorkspaceRoleError extends Error {
  constructor(
    message: string,
    readonly reason: "unauthenticated" | "forbidden"
  ) {
    super(message);
    this.name = "WorkspaceRoleError";
  }
}

export const checkUserWorkspaceRole = async (input: z.infer<typeof CheckWorkspaceRoleSchema>) => {
  const { workspaceId, roles } = CheckWorkspaceRoleSchema.parse(input);

  const session = await getServerSession();
  if (!session?.user) {
    throw new WorkspaceRoleError("Unauthorized: User not authenticated", "unauthenticated");
  }

  const membership = await db.query.membersOfWorkspaces.findFirst({
    where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, session.user.id)),
  });

  if (!membership) {
    throw new WorkspaceRoleError("User is not a member of this workspace", "forbidden");
  }

  const userRole = membership.memberRole as WorkspaceRole;

  if (!roles.includes(userRole)) {
    const roleList = roles.join(" or ");
    throw new WorkspaceRoleError(`Forbidden: Only ${roleList} roles can perform this action`, "forbidden");
  }

  return userRole;
};

export const countWorkspaceMemberships = async (userId: string): Promise<number> => {
  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, userId));
  return count;
};
