import {PropsWithChildren} from "react";

import BrowserWindow from "@/components/chat/browser-window";
import { AgentSidebar } from "@/components/chat/side-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const sidebarRef: Record<string, string> = { "--sidebar-width": "16rem" };
export default async function Layout({ children }: PropsWithChildren) {
  return (
    <>
      <SidebarProvider style={sidebarRef}>
        <AgentSidebar  />
        <SidebarInset>{children}</SidebarInset>
        <BrowserWindow />
      </SidebarProvider>
    </>
  );
}
