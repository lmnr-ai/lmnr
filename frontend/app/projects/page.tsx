import { eq, sql } from "drizzle-orm";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Header from "@/components/ui/header";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

import PostHogClient from "../posthog";
import PostHogIdentifier from "../posthog-identifier";

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

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, user.id));

  if (count === 0) {
    return redirect("/onboarding");
  }

  const posthog = PostHogClient();
  posthog.identify({
    distinctId: user.email ?? "",
  });

  return (
    <UserContextProvider
      id={user.id}
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <PostHogIdentifier email={user.email!} />
      <div className="flex flex-col grow min-h-screen ml-64 overflow-auto">
        <Header path="Projects" showSidebarTrigger={false} />
      </div>
    </UserContextProvider>
  );
}
