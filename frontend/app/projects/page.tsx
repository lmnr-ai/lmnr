import { eq } from "drizzle-orm";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    console.error(e);
    return redirect("/sign-in?callbackUrl=/projects");
  }

  if (!session) {
    return redirect("/sign-in?callbackUrl=/projects");
  }

  const user = session.user;

  const workspaces = await db
    .select({ workspaceId: membersOfWorkspaces.workspaceId })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, user.id))
    .limit(1);

  if (workspaces.length === 0) {
    return redirect("/onboarding");
  }

  return redirect(`/workspace/${workspaces[0].workspaceId}`);
}
