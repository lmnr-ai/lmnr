import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";
import { WorkspaceRole } from "@/lib/workspaces/types";

const CheckWorkspaceRoleSchema = z.object({
  workspaceId: z.string(),
  roles: z.array(z.enum(["member", "admin", "owner"])).min(1),
});

export const checkUserWorkspaceRole = async (input: z.infer<typeof CheckWorkspaceRoleSchema>) => {
  const { workspaceId, roles } = CheckWorkspaceRoleSchema.parse(input);

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const membership = await db.query.membersOfWorkspaces.findFirst({
    where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, session.user.id)),
  });

  if (!membership) {
    throw new Error("User is not a member of this workspace");
  }

  const userRole = membership.memberRole as WorkspaceRole;

  if (!roles.includes(userRole)) {
    const roleList = roles.join(" or ");
    throw new Error(`Forbidden: Only ${roleList} roles can perform this action`);
  }

  return userRole;
};
