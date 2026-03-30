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

const createSelfHostedInvitation = async (workspaceId: string, email: string) => {
  // If the user already exists and is a member, throw an error
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (existingUser) {
    const [existingMembership] = await db
      .select({ id: membersOfWorkspaces.id })
      .from(membersOfWorkspaces)
      .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, existingUser.id)))
      .limit(1);

    if (existingMembership) {
      throw new Error("This user is already a member of this workspace.");
    }

    // User exists but is not a member — add them directly
    await db.insert(membersOfWorkspaces).values({
      userId: existingUser.id,
      workspaceId,
      memberRole: "member",
    });

    return { success: true, message: "User added to workspace successfully" };
  }

  // User doesn't exist yet — check for duplicate pending invitation
  const [existingInvitation] = await db
    .select({ id: workspaceInvitations.id })
    .from(workspaceInvitations)
    .where(and(eq(workspaceInvitations.email, email), eq(workspaceInvitations.workspaceId, workspaceId)))
    .limit(1);

  if (existingInvitation) {
    throw new Error("An invitation for this email is already pending.");
  }

  // Create a pending invitation record. When this user signs up, they will
  // be automatically added to the workspace.
  await db.insert(workspaceInvitations).values({
    email,
    workspaceId,
  });

  return { success: true, message: "Invitation created successfully. The user will be added when they sign up." };
};

export const inviteUserToWorkspace = async (input: z.infer<typeof InviteUserSchema>) => {
  const { workspaceId, email } = InviteUserSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["admin", "owner"] });

  if (!isFeatureEnabled(Feature.SEND_EMAIL)) {
    return createSelfHostedInvitation(workspaceId, email);
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

  if (isFeatureEnabled(Feature.SUBSCRIPTION) && workspace.tierName.trim().toLowerCase() === "free") {
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
