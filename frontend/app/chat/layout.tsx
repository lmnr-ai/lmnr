import { PropsWithChildren } from "react";

import BrowserWindow from "@/components/chat/browser-window";
import { AgentSidebar } from "@/components/chat/side-bar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const sidebarRef: Record<string, string> = { "--sidebar-width": "16rem" };

export default async function Layout({ children }: PropsWithChildren) {
  return (
    <SidebarProvider style={sidebarRef}>
      <AgentSidebar />
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={60} maxSize={80} minSize={40}>
          <SidebarInset>{children}</SidebarInset>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <BrowserWindow />
      </ResizablePanelGroup>
    </SidebarProvider>
  );
}
