import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PropsWithChildren } from "react";

import PricingProvider from "@/components/chat/pricing-context";
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
    email: user.email,
    name: user.name,
    image: session.user.image || "",
    userSubscriptionTier: user.userSubscriptionTier.name,
  };

  return (
    <SidebarProvider style={sidebarRef}>
      <PricingProvider user={chatUser}>
        <AgentSidebar user={chatUser} />
        <SidebarInset>{children}</SidebarInset>
      </PricingProvider>
    </SidebarProvider>
  );
}
