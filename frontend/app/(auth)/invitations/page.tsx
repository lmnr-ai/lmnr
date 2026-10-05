import { differenceInMinutes } from "date-fns";
import { and, eq } from "drizzle-orm";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { type Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { secondaryAction } from "@/components/invitations/class-names";
import InvitationActions from "@/components/invitations/invitation-actions";
import InvitationShell from "@/components/invitations/invitation-shell";
import WrongAccountActions from "@/components/invitations/wrong-account-actions";
import { clearOnboardingState } from "@/lib/actions/onboarding";
import { getNewestProjectId } from "@/lib/actions/projects";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations, workspaces } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Workspace invitation - Laminar",
};

const INVITATION_EXPIRY_MINUTES = 10080; // 7 days

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
  const token = searchParams?.token as string;

  if (!token) {
    return notFound();
  }

  // Encode when embedding: an unescaped `?token=` would be parsed as a param of
  // the auth page itself, so the user would come back here without the token.
  const invitationUrl = `/invitations?token=${encodeURIComponent(token)}`;

  const session = await getServerSession();
  const user = session?.user;

  if (!user) {
    return redirect(`/sign-up?callbackUrl=${encodeURIComponent(invitationUrl)}`);
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

  if (isExpired) {
    return (
      <InvitationShell
        workspaceName={workspace.name}
        title="Invitation expired"
        description="This invitation is no longer valid. Ask a workspace admin to send a new one."
        email={user.email}
      >
        <div className="flex w-full">
          <Link href="/projects" className={secondaryAction}>
            Go to home
          </Link>
        </div>
      </InvitationShell>
    );
  }

  if (isWrongAccount) {
    return (
      <InvitationShell
        workspaceName={workspace.name}
        title="Wrong account"
        description="This invitation was sent to a different email address."
        email={user.email}
      >
        <WrongAccountActions workspaceId={decoded.workspaceId} invitationUrl={invitationUrl} />
      </InvitationShell>
    );
  }

  return (
    <InvitationShell
      workspaceName={workspace.name}
      title={`Join ${workspace.name} on Laminar`}
      description={
        <>
          You&apos;ve been invited to join <span className="text-white">{workspace.name}</span> on Laminar. Accept to
          start collaborating with the team.
        </>
      }
      email={user.email}
    >
      <InvitationActions
        workspaceId={decoded.workspaceId}
        acceptInvitation={acceptInvitation}
        declineInvitation={declineInvitation}
      />
    </InvitationShell>
  );
}
