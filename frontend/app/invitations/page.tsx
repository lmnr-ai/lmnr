import { differenceInMinutes } from "date-fns";
import { and, eq } from "drizzle-orm";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { Button } from "@/components/ui/button";
import { LaminarLogo } from "@/components/ui/icons";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations, workspaces } from "@/lib/db/migrations/schema";

const INVITATION_EXPIRY_MINUTES = 2880;

const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, process.env.NEXTAUTH_SECRET!) as JwtPayload;
  } catch (error) {
    console.error("Token verification failed:", token);
    notFound();
  }
};

const handleInvitation = async (action: "accept" | "decline", id: string, workspaceId: string, userId: string) => {
  "use server";

  if (id) {
    const invitation = await db.query.workspaceInvitations.findFirst({
      where: eq(workspaceInvitations.id, id),
    });

    if (!invitation) {
      throw new Error("No invitation found.");
    }

    if (action === "accept") {
      await db.transaction(async (tx) => {
        await tx
          .delete(workspaceInvitations)
          .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, workspaceId)));

        await tx.insert(membersOfWorkspaces).values({ userId, memberRole: "member", workspaceId });
      });

      revalidatePath(`/workspace/${workspaceId}`);
      redirect(`/workspace/${workspaceId}`);
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
  const session = await getServerSession(authOptions);
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

  async function acceptInvitation() {
    "use server";
    return handleInvitation("accept", decoded.id, decoded.workspaceId, user!.id);
  }

  async function declineInvitation() {
    "use server";
    return handleInvitation("decline", decoded.id, decoded.workspaceId, user!.id);
  }

  return (
    <div className="flex-1 flex items-center justify-center pb-16">
      {isExpired ? (
        <div className="w-full max-w-md border bg-secondary rounded p-8">
          <div className="flex flex-col items-start gap-6">
            <span className="font-medium text-center w-full">Invitation is expired</span>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md border bg-secondary rounded p-8">
          <div className="flex items-start flex-col gap-6">
            <LaminarLogo className="h-7 w-auto" fill="#b5b5b5" />
            <h2 className="font-medium">
              You are invited to join <span className="font-semibold">{workspace.name}</span>
            </h2>
            <div className="flex gap-4 w-full justify-center mt-6">
              <form action={acceptInvitation}>
                <Button type="submit">Accept</Button>
              </form>
              <form action={declineInvitation}>
                <Button type="submit" variant="outline">
                  Decline
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
