import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PropsWithChildren } from "react";

import BrowserWindow from "@/components/chat/browser-window";
import { AgentSidebar } from "@/components/chat/side-bar";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authOptions } from "@/lib/auth";

const sidebarRef: Record<string, string> = { "--sidebar-width": "16rem" };

export const experimental_ppr = true;

export default async function Layout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/sign-in?callbackUrl=/onboarding");
  }

  return (
    <SidebarProvider style={sidebarRef}>
      <AgentSidebar user={session?.user} />
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={60} maxSize={80} minSize={40}>
          <SidebarInset>{children}</SidebarInset>
        </ResizablePanel>
        <BrowserWindow />
      </ResizablePanelGroup>
    </SidebarProvider>
  );
}
