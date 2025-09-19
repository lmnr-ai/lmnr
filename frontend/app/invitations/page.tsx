import { differenceInMinutes } from "date-fns";
import { and, eq } from "drizzle-orm";
import jwt, { JwtPayload } from "jsonwebtoken";
import { revalidatePath } from "next/cache";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import logo from "@/assets/logo/logo.svg";
import { Button } from "@/components/ui/button";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { apiKeys, membersOfWorkspaces, workspaceInvitations, workspaces } from "@/lib/db/migrations/schema";

const INVITATION_EXPIRY_MINUTES = 2880;

const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, process.env.NEXTAUTH_SECRET!) as JwtPayload;
  } catch (error) {
    console.error("Token verification failed:", token);
    notFound();
  }
};

const handleInvitation = async (action: "accept" | "decline", id: string, workspaceId: string, apiKey: string) => {
  "use server";

  if (id) {
    const row = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.apiKey, apiKey),
    });

    if (!row) {
      throw new Error("No user found.");
    }

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

        await tx.insert(membersOfWorkspaces).values({ userId: row.userId, memberRole: "member", workspaceId });
      });
    }

    if (action === "decline") {
      await db
        .delete(workspaceInvitations)
        .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, workspaceId)));
    }

    revalidatePath("/projects");
    redirect("/projects");
  }
};

export default async function InvitationsPage(props: {
  params: Promise<{}>;
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
    return handleInvitation("accept", decoded.id, decoded.workspaceId, user!.apiKey);
  }

  async function declineInvitation() {
    "use server";
    return handleInvitation("decline", decoded.id, decoded.workspaceId, user!.apiKey);
  }

  return (
    <div className="flex h-full items-center justify-center">
      {isExpired ? (
        <span className="text-xl font-medium">Invitation is expired</span>
      ) : (
        <div className="flex flex-col justify-center items-center relative bg-primary rounded-lg flex-1 min-h-64 max-w-lg">
          <div className="z-20 flex flex-col items-center p-16 px-8">
            <Image alt="logo" src={logo} width={220} className="my-16" />
            <h2 className="text-lg font-medium mb-8 text-center">
              You are invited to join <b>{workspace.name}</b>
            </h2>
            <div className="flex gap-4">
              <form action={acceptInvitation}>
                <Button type="submit" variant="light" size="lg">
                  Accept
                </Button>
              </form>
              <form action={declineInvitation}>
                <Button type="submit" variant="lightSecondary" size="lg">
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
