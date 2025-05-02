import { eq, sql } from "drizzle-orm";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Projects from "@/components/projects/projects";
import WorkspacesNavbar from "@/components/projects/workspaces-navbar";
import Header from "@/components/ui/header";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

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

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, user.id));

  if (count === 0) {
    return redirect("/onboarding");
  }

  return (
    <UserContextProvider
      id={user.id}
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <WorkspacesNavbar />
      <div className="flex flex-col flex-grow min-h-screen ml-64 overflow-auto">
        <Header path="Projects" showSidebarTrigger={false} />
        <Projects isWorkspaceEnabled={isFeatureEnabled(Feature.WORKSPACE)} />
      </div>
    </UserContextProvider>
  );
}
