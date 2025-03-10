import { getServerSession } from "next-auth";
import { PropsWithChildren } from "react";

import { AgentSidebar } from "@/components/chat/side-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authOptions } from "@/lib/auth";

const sidebarRef: Record<string, string> = { "--sidebar-width": "16rem" };
export default async function Layout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  return (
    <>
      <SidebarProvider style={sidebarRef}>
        <AgentSidebar user={user} />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </>
  );
}
