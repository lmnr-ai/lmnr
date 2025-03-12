"use client";

import { SidebarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function ChatHeader({ chatId }: { chatId: string }) {
  const { toggleSidebar } = useSidebar();

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
    </header>
  );
}

export default ChatHeader;
