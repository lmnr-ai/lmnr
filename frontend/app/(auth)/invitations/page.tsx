import { differenceInMinutes } from "date-fns";
import { and, eq } from "drizzle-orm";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import InvitationActions from "@/components/invitations/invitation-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearOnboardingState } from "@/lib/actions/onboarding";
import { getNewestProjectId } from "@/lib/actions/projects";
import { subscribeMemberToWorkspaceNotifications } from "@/lib/actions/workspaces/subscribe";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations, workspaces } from "@/lib/db/migrations/schema";

const INVITATION_EXPIRY_MINUTES = 2880;

const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, (process.env.BETTER_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)!) as JwtPayload;
  } catch (error) {
    console.error("Token verification failed:", token);
    notFound();
  }
};

const handleInvitation = async (action: "accept" | "decline", id: string, workspaceId: string) => {
  "use server";

  if (id) {
    // Re-derive the actor from the live session here — this server action is the
    // authorization boundary, so don't trust an id bound at render time.
    const session = await getServerSession();
    if (!session?.user) {
      return redirect("/sign-in");
    }
    const userId = session.user.id;

    const invitation = await db.query.workspaceInvitations.findFirst({
      where: eq(workspaceInvitations.id, id),
    });

    if (!invitation) {
      throw new Error("No invitation found.");
    }

    // The invite link is shareable, so possessing it is NOT consent: only the invited
    // email may act on it. Legacy rows with no stored email can't be enforced.
    if (invitation.email && invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      throw new Error("This invitation was sent to a different email address.");
    }

    if (action === "accept") {
      await db.transaction(async (tx) => {
        await tx
          .delete(workspaceInvitations)
          .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, workspaceId)));

        // Idempotent: re-accepting (or accepting while already a member) shouldn't 500.
        await tx
          .insert(membersOfWorkspaces)
          .values({ userId, memberRole: "member", workspaceId })
          .onConflictDoNothing();
      });

      // Best-effort: a subscribe failure must not skip the onboarding cleanup +
      // redirect below, or the (app) layout would trap the now-member in the wizard.
      try {
        await subscribeMemberToWorkspaceNotifications(workspaceId, session.user.email);
      } catch (e) {
        console.error("Failed to subscribe member to workspace notifications:", e);
      }

      // Joining a real team workspace supersedes any in-progress wizard — without
      // this clear, the (app) layout would bounce back to /onboarding.
      await clearOnboardingState();

      // Land in the joined workspace's newest project; /projects (its own resolver) if it has none.
      const joinedProjectId = await getNewestProjectId(workspaceId);
      revalidatePath("/projects");
      redirect(joinedProjectId ? `/project/${joinedProjectId}/traces` : "/projects");
    }

    if (action === "decline") {
      await db
        .delete(workspaceInvitations)
        .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, workspaceId)));

      revalidatePath("/projects");
      redirect("/projects");
    }
  }
};

export default async function InvitationsPage(props: {
  params: Promise<Record<string, never>>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession();
  const user = session?.user;

  if (!user) {
    return redirect(`/sign-up?callbackUrl=/invitations?token=${searchParams?.token}`);
  }

  const token = searchParams?.token as string;

  if (!token) {
    return notFound();
  }

  const decoded = verifyToken(token);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, decoded.workspaceId),
  });

  if (!workspace) {
    return notFound();
  }

  const invitation = await db.query.workspaceInvitations.findFirst({
    where: eq(workspaceInvitations.id, decoded.id),
  });

  const isExpired =
    !invitation || differenceInMinutes(new Date(), new Date(invitation?.createdAt)) > INVITATION_EXPIRY_MINUTES;

  const isWrongAccount = !!invitation?.email && invitation.email.toLowerCase() !== user.email.toLowerCase();

  async function acceptInvitation() {
    "use server";
    return handleInvitation("accept", decoded.id, decoded.workspaceId);
  }

  async function declineInvitation() {
    "use server";
    return handleInvitation("decline", decoded.id, decoded.workspaceId);
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-6">
      {isExpired ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation expired</CardTitle>
            <CardDescription>
              This invitation is no longer valid. Ask a workspace admin to send a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isWrongAccount ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <span className="text-xs text-muted-foreground/80">Signed in as {user.email}</span>
            <CardTitle>Wrong account</CardTitle>
            <CardDescription className="mt-1">
              This invitation was sent to a different email address. Sign in with the invited account to accept it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <span className="text-xs text-muted-foreground/80">Signed in as {user.email}</span>
            <CardTitle>Join {workspace.name}</CardTitle>
            <CardDescription className="mt-1">
              You&apos;ve been invited to collaborate on this workspace on Laminar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvitationActions
              workspaceId={decoded.workspaceId}
              acceptInvitation={acceptInvitation}
              declineInvitation={declineInvitation}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
