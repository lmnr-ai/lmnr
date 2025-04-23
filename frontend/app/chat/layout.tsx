import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PropsWithChildren } from "react";

import SessionProvider from "@/components/chat/session-context";
import { AgentSidebar } from "@/components/chat/side-bar";
import { ChatUser } from "@/components/chat/types";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";

const sidebarRef: Record<string, string> = { "--sidebar-width": "16rem" };

export const experimental_ppr = true;

export default async function Layout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/sign-in?callbackUrl=/chat");
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, session.user.email!),
    with: {
      userSubscriptionTier: true,
    },
  });

  if (!user) {
    redirect("/sign-in?callbackUrl=/chat");
  }

  const chatUser: ChatUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    image: session.user.image || "",
    userSubscriptionTier: user.userSubscriptionTier.name,
    supabaseAccessToken: session.supabaseAccessToken,
  };

  return (
    <SidebarProvider style={sidebarRef}>
      <SessionProvider user={chatUser}>
        <AgentSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SessionProvider>
    </SidebarProvider>
  );
}
