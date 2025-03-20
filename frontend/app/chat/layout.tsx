import { PropsWithChildren } from "react";

import BrowserContextProvider from "@/components/chat/browser-context";
import BrowserWindow from "@/components/chat/browser-window";
import { AgentSidebar } from "@/components/chat/side-bar";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const sidebarRef: Record<string, string> = { "--sidebar-width": "16rem" };

export const experimental_ppr = true;

export default async function Layout({ children }: PropsWithChildren) {
  return (
    <SidebarProvider style={sidebarRef}>
      <AgentSidebar />
      <BrowserContextProvider>
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={60} maxSize={80} minSize={40}>
            <SidebarInset>{children}</SidebarInset>
          </ResizablePanel>
          <BrowserWindow />
        </ResizablePanelGroup>
      </BrowserContextProvider>
    </SidebarProvider>
  );
}
