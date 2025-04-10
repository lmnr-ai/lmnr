import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PropsWithChildren } from "react";

import { AgentSidebar } from "@/components/chat/side-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { eq } from "drizzle-orm";
import { ChatUser } from "@/components/chat/types";

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
    email: user.email,
    name: user.name,
    image: session.user.image || "",
    userSubscriptionTier: user.userSubscriptionTier.name,
  };

  return (
    <SidebarProvider style={sidebarRef}>
      <AgentSidebar user={chatUser} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
