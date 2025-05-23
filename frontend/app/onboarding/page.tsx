import { eq, sql } from "drizzle-orm";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import CreateFirstWorkspaceAndProject from "@/components/onboarding/create-first-workspace-and-project";
import OnboardingHeader from "@/components/onboarding/onboarding-header";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Create workspace and project",
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
    return redirect("/projects");
  }

  const user = session.user;

  return (
    <UserContextProvider
      id={user.id}
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <div className="flex flex-col h-full w-full">
        <OnboardingHeader />
        <CreateFirstWorkspaceAndProject name={user.name} />
      </div>
    </UserContextProvider>
  );
}
