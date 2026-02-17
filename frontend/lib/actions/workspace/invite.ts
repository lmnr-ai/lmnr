import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { workspaceInvitations, workspaces } from "@/lib/db/migrations/schema";
import { sendInvitationEmail } from "@/lib/emails/utils";

const InviteUserSchema = z.object({
  workspaceId: z.string(),
  email: z.string(),
});

export const inviteUserToWorkspace = async (input: z.infer<typeof InviteUserSchema>) => {
  const { workspaceId, email } = InviteUserSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["admin", "owner"] });

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error("Workspace not found");
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
