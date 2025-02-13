import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PropsWithChildren } from "react";

import { UserContextProvider } from "@/contexts/user-context";
import { WorkspaceContextProvider } from "@/contexts/workspace-context";
import { authOptions } from "@/lib/auth";

export default async function ProjectsLayout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in?callbackUrl=/onboarding");
  }
  const user = session.user;

  return (
    <WorkspaceContextProvider>
      <UserContextProvider
        email={user.email!}
        supabaseAccessToken={session.supabaseAccessToken}
        username={user.name!}
        imageUrl={user.image!}
      >
        {children}
      </UserContextProvider>
    </WorkspaceContextProvider>
  );
}
