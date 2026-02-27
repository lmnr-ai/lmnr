import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  subscriptionTiers,
  users,
  workspaceInvitations,
  workspaces,
} from "@/lib/db/migrations/schema";
import { sendInvitationEmail } from "@/lib/emails/utils";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

const InviteUserSchema = z.object({
  workspaceId: z.string(),
  email: z.string(),
});

const addExistingUserToWorkspace = async (workspaceId: string, email: string) => {
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (!existingUser) {
    throw new Error("No user found with this email. The user must have an existing account.");
  }

  const [existingMembership] = await db
    .select({ id: membersOfWorkspaces.id })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, existingUser.id)))
    .limit(1);

  if (existingMembership) {
    throw new Error("This user is already a member of this workspace.");
  }

  await db.insert(membersOfWorkspaces).values({
    userId: existingUser.id,
    workspaceId,
    memberRole: "member",
  });

  return { success: true, message: "User added to workspace successfully" };
};

export const inviteUserToWorkspace = async (input: z.infer<typeof InviteUserSchema>) => {
  const { workspaceId, email } = InviteUserSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["admin", "owner"] });

  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) {
    return addExistingUserToWorkspace(workspaceId, email);
  }

  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.tierName.trim().toLowerCase() === "free") {
    throw new Error("Inviting members is not available on the Free plan. Please upgrade to invite team members.");
  }

  const [{ id }] = await db
    .insert(workspaceInvitations)
    .values({
      email,
      workspaceId,
    })
    .returning({ id: workspaceInvitations.id });

  const token = jwt.sign(
    {
      id,
      workspaceId,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "48h" }
  );

  const link = `${process.env.NEXTAUTH_URL}/invitations?token=${token}`;

  await sendInvitationEmail(email, workspace.name, link);

  return { success: true, message: "Invitation sent successfully" };
};
