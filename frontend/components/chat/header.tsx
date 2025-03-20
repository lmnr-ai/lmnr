"use client";

import { PanelRight, SidebarIcon } from "lucide-react";

import { useBrowserContext } from "@/components/chat/browser-context";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function ChatHeader() {
  const { toggleSidebar } = useSidebar();
  const { open, setOpen } = useBrowserContext();

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button onClick={toggleSidebar} variant="ghost" size="icon" className="size-8 hover:bg-muted">
            <SidebarIcon size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent align="start">Toggle Sidebar</TooltipContent>
      </Tooltip>
      <Button onClick={() => setOpen(!open)} variant="ghost" size="icon" className="ml-auto">
        <PanelRight size={16} />
      </Button>
    </header>
  );
}

export default ChatHeader;
