import { eq, sql } from "drizzle-orm";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import CreateFirstWorkspaceAndProject from "@/components/onboarding/create-first-workspace-and-project";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Get Started - Laminar",
};

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in?callbackUrl=/onboarding");
  }

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, session.user.id));

  if (count > 0) {
    // legacy, redirect to projects to later redirect user to first workspace.
    return redirect("/projects");
  }

  const user = session.user;

  return (
    <UserContextProvider user={user}>
      <div className="flex flex-col h-screen w-full bg-background">
        <CreateFirstWorkspaceAndProject name={user.name} />
      </div>
    </UserContextProvider>
  );
}
